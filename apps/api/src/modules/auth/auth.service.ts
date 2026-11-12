import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuthContext } from '../../common/auth-context';
import { AccessPayload } from '../../common/auth.guard';
import { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LoginInput, RegisterInput } from './auth.schemas';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const ARGON_OPTIONS = { type: argon2.argon2id } as const;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: { id: string; name: string; email: string };
  tenant: { id: string; name: string; slug: string; role: string };
}

export const hashPassword = (plain: string) => argon2.hash(plain, ARGON_OPTIONS);

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function slugify(name: string) {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return `${base || 'loja'}-${randomBytes(3).toString('hex')}`;
}

@Injectable()
export class AuthService {
  /** Hash "falso" usado quando o e-mail não existe, para o tempo de resposta não revelar isso. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(input: RegisterInput): Promise<IssuedSession> {
    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Este e-mail já está cadastrado');

    const passwordHash = await hashPassword(input.password);
    const userId = randomUUID();
    const tenantId = randomUUID();

    await this.db.withContext({ tenantId, userId }, async (tx) => {
      await tx.user.create({
        data: { id: userId, name: input.name, email: input.email, passwordHash },
      });
      await tx.tenant.create({
        data: {
          id: tenantId,
          name: input.establishmentName,
          slug: slugify(input.establishmentName),
          segment: input.segment,
          timezone: input.timezone,
        },
      });
      await tx.membership.create({ data: { tenantId, userId, role: 'OWNER' } });
    });

    return this.issueSession(userId, tenantId);
  }

  async login(input: LoginInput): Promise<IssuedSession> {
    const invalid = new UnauthorizedException('E-mail ou senha incorretos');
    const user = await this.db.user.findUnique({ where: { email: input.email } });

    if (!user) {
      this.dummyHash ??= hashPassword('gestock-dummy-password');
      await argon2.verify(await this.dummyHash, input.password);
      throw invalid;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Muitas tentativas incorretas. Tente novamente em alguns minutos.',
      );
    }

    if (!(await argon2.verify(user.passwordHash, input.password))) {
      const failed = user.failedLoginCount + 1;
      await this.db.user.update({
        where: { id: user.id },
        data:
          failed >= MAX_FAILED_LOGINS
            ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
            : { failedLoginCount: failed },
      });
      throw invalid;
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }

    const memberships = await this.activeMemberships(user.id);
    if (memberships.length === 0) {
      throw new ForbiddenException('Seu usuário não está vinculado a nenhum estabelecimento ativo');
    }
    const chosen =
      memberships.find((m) => m.tenantId === input.tenantId) ?? memberships[0];

    return this.issueSession(user.id, chosen.tenantId);
  }

  /** Troca o refresh token por um novo (rotação). Reuso de token revogado derruba todas as sessões. */
  async refresh(rawToken: string | undefined): Promise<IssuedSession> {
    if (!rawToken) throw new UnauthorizedException('Sessão expirada');
    const stored = await this.db.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (!stored) throw new UnauthorizedException('Sessão expirada');

    if (stored.revokedAt) {
      await this.revokeAll(stored.userId);
      throw new UnauthorizedException('Sessão inválida. Faça login novamente.');
    }
    if (stored.expiresAt < new Date() || !stored.tenantId) {
      throw new UnauthorizedException('Sessão expirada');
    }

    await this.db.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const memberships = await this.activeMemberships(stored.userId);
    const tenantId = memberships.find((m) => m.tenantId === stored.tenantId)?.tenantId;
    if (!tenantId) throw new ForbiddenException('Sem acesso a este estabelecimento');

    return this.issueSession(stored.userId, tenantId);
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    await this.db.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async switchTenant(auth: AuthContext, tenantId: string, rawToken?: string) {
    const memberships = await this.activeMemberships(auth.userId);
    if (!memberships.some((m) => m.tenantId === tenantId)) {
      throw new ForbiddenException('Sem acesso a este estabelecimento');
    }
    await this.logout(rawToken);
    return this.issueSession(auth.userId, tenantId);
  }

  async me(auth: AuthContext) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    const memberships = await this.activeMemberships(auth.userId);
    return {
      user,
      activeTenantId: auth.tenantId,
      role: auth.role,
      tenants: memberships.map((m) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        role: m.role,
      })),
    };
  }

  private activeMemberships(userId: string) {
    return this.db.withContext({ userId }, (tx) =>
      tx.membership.findMany({
        where: { userId, status: 'ACTIVE' },
        include: { tenant: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  private revokeAll(userId: string) {
    return this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(userId: string, tenantId: string): Promise<IssuedSession> {
    const { user, membership } = await this.db.withContext({ tenantId, userId }, async (tx) => ({
      user: await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      }),
      membership: await tx.membership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId, userId } },
        include: { tenant: { select: { id: true, name: true, slug: true } } },
      }),
    }));

    const payload: AccessPayload = { sub: userId, tid: tenantId };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(48).toString('base64url');
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const refreshExpiresAt = new Date(Date.now() + days * 24 * 60 * 60_000);
    await this.db.refreshToken.create({
      data: { userId, tenantId, tokenHash: sha256(refreshToken), expiresAt: refreshExpiresAt },
    });

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt,
      user,
      tenant: { ...membership.tenant, role: membership.role },
    };
  }
}
