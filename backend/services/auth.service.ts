import { randomUUID } from 'node:crypto';
import { env } from '@/config/env';
import { withContext } from '@/config/database';
import {
  membershipRepository,
  type MembershipRepository,
} from '@/repositories/membership.repository';
import {
  refreshTokenRepository,
  type RefreshTokenRepository,
} from '@/repositories/refresh-token.repository';
import { tenantRepository, type TenantRepository } from '@/repositories/tenant.repository';
import { userRepository, type UserRepository } from '@/repositories/user.repository';
import { auditService, type AuditService } from '@/services/audit.service';
import type {
  AuthContext,
  ChangePasswordDTO,
  IssuedSession,
  LoginDTO,
  RegisterDTO,
  UpdateProfileDTO,
} from '@/types/auth.types';
import { AppError } from '@/utils/app-error';
import { signAccessToken } from '@/utils/jwt';
import { hashPassword, simulatePasswordCheck, verifyPassword } from '@/utils/password';
import { slugify } from '@/utils/slug';
import { generateOpaqueToken, sha256 } from '@/utils/token';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

/**
 * Janela em que reusar um refresh token recém-rotacionado é tratado como corrida
 * (duas abas renovando juntas) e não como roubo. Nesse caso a requisição só é recusada,
 * sem derrubar as outras sessões; o front tenta de novo com o cookie novo.
 */
const REFRESH_GRACE_MS = 30_000;
export const REFRESH_RACE = 'REFRESH_RACE';

const invalidCredentials = () => new AppError('E-mail ou senha incorretos', 401);

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly tenants: TenantRepository,
    private readonly memberships: MembershipRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly audit: AuditService,
  ) {}

  /** Cria o usuário, o estabelecimento e o vínculo de dono, numa transação só. */
  async register(input: RegisterDTO): Promise<IssuedSession> {
    if (await this.users.findByEmail(input.email)) {
      throw new AppError('Este e-mail já está cadastrado', 409);
    }

    const passwordHash = await hashPassword(input.password);
    const userId = randomUUID();
    const tenantId = randomUUID();

    await withContext({ tenantId, userId }, async (tx) => {
      await this.users.create(
        { id: userId, name: input.name, email: input.email, passwordHash },
        tx,
      );
      await this.tenants.create(tx, {
        id: tenantId,
        name: input.establishmentName,
        slug: slugify(input.establishmentName),
        segment: input.segment,
        timezone: input.timezone,
      });
      await this.memberships.create(tx, { tenantId, userId, role: 'OWNER' });
    });

    return this.issueSession(userId, tenantId);
  }

  /**
   * Login. A resposta é a mesma para e-mail inexistente, senha errada e conta bloqueada
   * (quem não sabe a senha não descobre se a conta existe). Só quem acerta a senha de uma
   * conta bloqueada fica sabendo do bloqueio.
   */
  async login(input: LoginDTO): Promise<IssuedSession> {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      await simulatePasswordCheck(input.password);
      throw invalidCredentials();
    }

    const passwordOk = await verifyPassword(user.passwordHash, input.password);

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      if (passwordOk) {
        throw new AppError('Muitas tentativas incorretas. Tente novamente em alguns minutos.', 401);
      }
      throw invalidCredentials();
    }

    if (!passwordOk) {
      // Incremento atômico: tentativas simultâneas são todas contadas.
      const { failedLoginCount } = await this.users.update(user.id, {
        failedLoginCount: { increment: 1 },
      });
      if (failedLoginCount >= MAX_FAILED_LOGINS) {
        await this.users.update(user.id, {
          failedLoginCount: 0,
          lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
        });
      }
      throw invalidCredentials();
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.users.update(user.id, { failedLoginCount: 0, lockedUntil: null });
    }

    const memberships = await this.activeMemberships(user.id);
    if (memberships.length === 0) {
      throw new AppError('Seu usuário não está vinculado a nenhum estabelecimento ativo', 403);
    }
    const chosen = memberships.find((m) => m.tenantId === input.tenantId) ?? memberships[0];

    return this.issueSession(user.id, chosen.tenantId);
  }

  /** Troca o refresh token por um novo (rotação). Reuso de token revogado derruba todas as sessões. */
  async refresh(rawToken: string | undefined): Promise<IssuedSession> {
    if (!rawToken) throw new AppError('Sessão expirada', 401);
    const stored = await this.refreshTokens.findByHash(sha256(rawToken));
    if (!stored) throw new AppError('Sessão expirada', 401);

    if (stored.revokedAt) {
      // Só a ROTAÇÃO recente é tolerada (duas abas). Logout, troca de senha ou roubo detectado: não.
      if (
        stored.revokedReason === 'ROTATED' &&
        Date.now() - stored.revokedAt.getTime() < REFRESH_GRACE_MS
      ) {
        throw new AppError('A sessão acabou de ser renovada. Tente novamente.', 409, REFRESH_RACE);
      }
      await this.refreshTokens.revokeAllForUser(stored.userId, 'REUSE_DETECTED');
      throw new AppError('Sessão inválida. Faça login novamente.', 401);
    }
    if (stored.expiresAt < new Date() || !stored.tenantId) {
      throw new AppError('Sessão expirada', 401);
    }

    // Revogação atômica: se outra requisição chegou primeiro, esta perde a corrida.
    if (!(await this.refreshTokens.rotate(stored.id))) {
      throw new AppError('A sessão acabou de ser renovada. Tente novamente.', 409, REFRESH_RACE);
    }

    const memberships = await this.activeMemberships(stored.userId);
    const tenantId = memberships.find((m) => m.tenantId === stored.tenantId)?.tenantId;
    if (!tenantId) throw new AppError('Sem acesso a este estabelecimento', 403);

    return this.issueSession(stored.userId, tenantId);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.refreshTokens.revokeByHash(sha256(rawToken));
  }

  async switchTenant(auth: AuthContext, tenantId: string, rawToken?: string) {
    const memberships = await this.activeMemberships(auth.userId);
    if (!memberships.some((m) => m.tenantId === tenantId)) {
      throw new AppError('Sem acesso a este estabelecimento', 403);
    }
    await this.logout(rawToken);
    return this.issueSession(auth.userId, tenantId);
  }

  /** Troca a senha e encerra todas as outras sessões. Devolve uma sessão nova para este aparelho. */
  async changePassword(auth: AuthContext, input: ChangePasswordDTO): Promise<IssuedSession> {
    const user = await this.users.findById(auth.userId);
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new AppError('Senha atual incorreta', 401);
    }
    await this.users.update(user.id, {
      passwordHash: await hashPassword(input.newPassword),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    });
    await this.refreshTokens.revokeAllForUser(user.id, 'PASSWORD_CHANGED');
    return this.issueSession(user.id, auth.tenantId);
  }

  async me(auth: AuthContext) {
    const user = await this.users.findProfile(auth.userId);
    const memberships = await this.activeMemberships(auth.userId);
    const invitations = await this.listInvitations(auth.userId);
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
      invitations,
    };
  }

  // ---------- Convites ----------

  /** Convites pendentes: estabelecimentos que adicionaram este usuário e aguardam o aceite. */
  async listInvitations(userId: string) {
    const rows = await withContext({ userId }, (tx) =>
      this.memberships.listInvitationsForUser(tx, userId),
    );
    return rows.map((r) => ({ tenant: r.tenant, role: r.role, invitedAt: r.createdAt }));
  }

  acceptInvitation(auth: AuthContext, tenantId: string) {
    return withContext({ tenantId, userId: auth.userId }, async (tx) => {
      const invitation = await this.memberships.findOne(tx, tenantId, auth.userId);
      if (!invitation || invitation.status !== 'INVITED') {
        throw new AppError('Convite não encontrado', 404);
      }
      const membership = await this.memberships.update(tx, invitation.id, { status: 'ACTIVE' });
      await this.audit.log(
        tx,
        { tenantId, userId: auth.userId },
        'member.accept',
        'membership',
        invitation.id,
      );
      return membership;
    });
  }

  declineInvitation(auth: AuthContext, tenantId: string) {
    return withContext({ tenantId, userId: auth.userId }, async (tx) => {
      const invitation = await this.memberships.findOne(tx, tenantId, auth.userId);
      if (!invitation || invitation.status !== 'INVITED') {
        throw new AppError('Convite não encontrado', 404);
      }
      await this.memberships.delete(tx, invitation.id);
      await this.audit.log(
        tx,
        { tenantId, userId: auth.userId },
        'member.decline',
        'membership',
        invitation.id,
      );
    });
  }

  // ---------- Auxiliares ----------

  /**
   * Edita o próprio perfil. Trocar o e-mail (que é o login) pede a senha atual: quem pegar o
   * celular desbloqueado não consegue tomar a conta trocando o e-mail.
   */
  async updateProfile(auth: AuthContext, input: UpdateProfileDTO) {
    const user = await this.users.findById(auth.userId);
    const emailChanged = input.email !== undefined && input.email !== user.email;
    if (emailChanged) {
      if (!(await verifyPassword(user.passwordHash, input.currentPassword ?? ''))) {
        // 400 (não 401): é regra do formulário, não sessão expirada.
        throw new AppError('Senha atual incorreta', 400);
      }
      const taken = await this.users.findByEmail(input.email!);
      if (taken) throw new AppError('Este e-mail já está em uso', 409);
    }
    await this.users.update(user.id, {
      name: input.name,
      email: emailChanged ? input.email : undefined,
    });
    return this.users.findPublicById(user.id);
  }

  private activeMemberships(userId: string) {
    return withContext({ userId }, (tx) => this.memberships.listActiveForUser(tx, userId));
  }

  private async issueSession(userId: string, tenantId: string): Promise<IssuedSession> {
    const { user, membership } = await withContext({ tenantId, userId }, async (tx) => ({
      user: await this.users.findPublicById(userId, tx),
      membership: await this.memberships.findWithTenant(tx, tenantId, userId),
    }));

    const accessToken = signAccessToken({ sub: userId, tid: tenantId });

    const refreshToken = generateOpaqueToken();
    const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60_000);
    await this.refreshTokens.create({
      userId,
      tenantId,
      tokenHash: sha256(refreshToken),
      expiresAt: refreshExpiresAt,
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

export const authService = new AuthService(
  userRepository,
  tenantRepository,
  membershipRepository,
  refreshTokenRepository,
  auditService,
);
