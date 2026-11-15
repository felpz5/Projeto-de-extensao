import { withContext, type Tx } from '@/config/database';
import {
  membershipRepository,
  type MembershipRepository,
} from '@/repositories/membership.repository';
import { tenantRepository, type TenantRepository } from '@/repositories/tenant.repository';
import { userRepository, type UserRepository } from '@/repositories/user.repository';
import { auditService, type AuditService } from '@/services/audit.service';
import type { AuthContext } from '@/types/auth.types';
import type { AddMemberDTO, UpdateMemberDTO, UpdateTenantDTO } from '@/types/tenant.types';
import { AppError } from '@/utils/app-error';
import { hashPassword } from '@/utils/password';

/** Dados do estabelecimento e equipe. */
export class TenantService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly memberships: MembershipRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditService,
  ) {}

  current(auth: AuthContext) {
    return withContext(auth, (tx) => this.tenants.findById(tx, auth.tenantId));
  }

  update(auth: AuthContext, input: UpdateTenantDTO) {
    return withContext(auth, async (tx) => {
      const tenant = await this.tenants.update(tx, auth.tenantId, input);
      await this.audit.log(tx, auth, 'tenant.update', 'tenant', tenant.id, input);
      return tenant;
    });
  }

  listMembers(auth: AuthContext) {
    return withContext(auth, (tx) => this.memberships.listForTenant(tx, auth.tenantId));
  }

  /**
   * Adiciona alguém à equipe.
   * - E-mail sem conta: cria a conta com a senha provisória (troca obrigatória no 1º acesso)
   *   e o vínculo já fica ATIVO.
   * - E-mail que já tem conta: cria um CONVITE (status INVITED). A pessoa só entra no
   *   estabelecimento depois de aceitar — ninguém é colocado na equipe de outro sem consentir.
   */
  async addMember(auth: AuthContext, input: AddMemberDTO) {
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;

    return withContext(auth, async (tx) => {
      const existing = await this.users.findByEmail(input.email, tx);
      if (!existing && (!input.name || !passwordHash)) {
        throw new AppError(
          'Este e-mail ainda não tem conta: informe nome e uma senha provisória',
          400,
        );
      }

      if (existing) {
        const current = await this.memberships.findOne(tx, auth.tenantId, existing.id);
        if (current?.status === 'INVITED') {
          throw new AppError('Essa pessoa já foi convidada e ainda não respondeu', 409);
        }
        if (current) throw new AppError('Essa pessoa já faz parte do estabelecimento', 409);
      }

      const user =
        existing ??
        (await this.users.create(
          {
            name: input.name!,
            email: input.email,
            passwordHash: passwordHash!,
            mustChangePassword: true,
          },
          tx,
        ));
      const status = existing ? 'INVITED' : 'ACTIVE';

      const membership = await this.memberships.create(tx, {
        tenantId: auth.tenantId,
        userId: user.id,
        role: input.role,
        status,
      });
      await this.audit.log(
        tx,
        auth,
        existing ? 'member.invite' : 'member.add',
        'membership',
        membership.id,
        { userId: user.id, role: input.role },
      );
      return membership;
    });
  }

  updateMember(auth: AuthContext, userId: string, input: UpdateMemberDTO) {
    if (userId === auth.userId) {
      throw new AppError('Você não pode alterar o próprio acesso', 403);
    }
    return withContext(auth, async (tx) => {
      const current = await this.findMember(tx, auth.tenantId, userId);
      if (current.role === 'OWNER') throw new AppError('Não é possível alterar o dono', 403);
      if (current.status === 'INVITED' && input.status) {
        throw new AppError(
          'O convite ainda não foi aceito: só a própria pessoa pode aceitá-lo',
          400,
        );
      }

      const membership = await this.memberships.update(tx, current.id, input);
      await this.audit.log(tx, auth, 'member.update', 'membership', current.id, input);
      return membership;
    });
  }

  /** Remove um membro (ou cancela um convite pendente). */
  removeMember(auth: AuthContext, userId: string) {
    if (userId === auth.userId) {
      throw new AppError('Você não pode remover a si mesmo', 403);
    }
    return withContext(auth, async (tx) => {
      const current = await this.findMember(tx, auth.tenantId, userId);
      if (current.role === 'OWNER') throw new AppError('Não é possível remover o dono', 403);

      await this.memberships.delete(tx, current.id);
      await this.audit.log(tx, auth, 'member.remove', 'membership', current.id, { userId });
    });
  }

  private async findMember(tx: Tx, tenantId: string, userId: string) {
    const member = await this.memberships.findOne(tx, tenantId, userId);
    if (!member) throw new AppError('Membro não encontrado', 404);
    return member;
  }
}

export const tenantService = new TenantService(
  tenantRepository,
  membershipRepository,
  userRepository,
  auditService,
);
