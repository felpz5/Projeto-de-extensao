import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import { AuthContext } from '../../common/auth-context';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { hashPassword } from '../auth/auth.service';
import { AddMemberInput, UpdateMemberInput, UpdateTenantInput } from './tenants.schemas';

const memberSelect = {
  id: true,
  role: true,
  status: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class TenantsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  current(auth: AuthContext) {
    return this.db.withContext(auth, (tx) =>
      tx.tenant.findUniqueOrThrow({ where: { id: auth.tenantId } }),
    );
  }

  update(auth: AuthContext, input: UpdateTenantInput) {
    return this.db.withContext(auth, async (tx) => {
      const tenant = await tx.tenant.update({ where: { id: auth.tenantId }, data: input });
      await this.audit.log(tx, auth, 'tenant.update', 'tenant', tenant.id, input);
      return tenant;
    });
  }

  listMembers(auth: AuthContext) {
    return this.db.withContext(auth, (tx) =>
      tx.membership.findMany({
        where: { tenantId: auth.tenantId },
        select: memberSelect,
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async addMember(auth: AuthContext, input: AddMemberInput) {
    let user = await this.db.user.findUnique({ where: { email: input.email } });
    if (!user) {
      if (!input.name || !input.password) {
        throw new BadRequestException(
          'Este e-mail ainda não tem conta: informe nome e uma senha provisória',
        );
      }
      user = await this.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password),
        },
      });
    }
    const userId = user.id;

    return this.db.withContext(auth, async (tx) => {
      const exists = await tx.membership.findUnique({
        where: { tenantId_userId: { tenantId: auth.tenantId, userId } },
      });
      if (exists) throw new ConflictException('Essa pessoa já faz parte do estabelecimento');

      const membership = await tx.membership.create({
        data: { tenantId: auth.tenantId, userId, role: input.role },
        select: memberSelect,
      });
      await this.audit.log(tx, auth, 'member.add', 'membership', membership.id, {
        userId,
        role: input.role,
      });
      return membership;
    });
  }

  updateMember(auth: AuthContext, userId: string, input: UpdateMemberInput) {
    if (userId === auth.userId) {
      throw new ForbiddenException('Você não pode alterar o próprio acesso');
    }
    return this.db.withContext(auth, async (tx) => {
      const current = await this.findMember(tx, auth.tenantId, userId);
      if (current.role === 'OWNER') throw new ForbiddenException('Não é possível alterar o dono');

      const membership = await tx.membership.update({
        where: { id: current.id },
        data: input,
        select: memberSelect,
      });
      await this.audit.log(tx, auth, 'member.update', 'membership', current.id, input);
      return membership;
    });
  }

  removeMember(auth: AuthContext, userId: string) {
    if (userId === auth.userId) {
      throw new ForbiddenException('Você não pode remover a si mesmo');
    }
    return this.db.withContext(auth, async (tx) => {
      const current = await this.findMember(tx, auth.tenantId, userId);
      if (current.role === 'OWNER') throw new ForbiddenException('Não é possível remover o dono');

      await tx.membership.delete({ where: { id: current.id } });
      await this.audit.log(tx, auth, 'member.remove', 'membership', current.id, { userId });
    });
  }

  private async findMember(tx: Tx, tenantId: string, userId: string) {
    const m = await tx.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!m) throw new NotFoundException('Membro não encontrado');
    return m;
  }
}
