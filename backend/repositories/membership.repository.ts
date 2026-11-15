import type { Prisma } from '@prisma/client';
import type { Tx } from '@/config/database';

/** Campos de um membro devolvidos pela API (sem dados sensíveis do usuário). */
const memberSelect = {
  id: true,
  role: true,
  status: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

const tenantRef = { select: { id: true, name: true, slug: true } } as const;

export class MembershipRepository {
  findOne(tx: Tx, tenantId: string, userId: string) {
    return tx.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } } });
  }

  findWithTenant(tx: Tx, tenantId: string, userId: string) {
    return tx.membership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId, userId } },
      include: { tenant: tenantRef },
    });
  }

  /**
   * Em quantos estabelecimentos ALÉM deste a pessoa tem vínculo (ativo, desativado ou convite).
   * Rodar com o contexto do PRÓPRIO usuário (a RLS só mostra os vínculos dele).
   */
  countOtherTenants(tx: Tx, userId: string, tenantId: string) {
    return tx.membership.count({ where: { userId, tenantId: { not: tenantId } } });
  }

  /** Vínculos ativos do usuário, do mais antigo para o mais novo. */
  listActiveForUser(tx: Tx, userId: string) {
    return tx.membership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { tenant: tenantRef },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Convites pendentes do usuário (rodar com o contexto só do usuário). */
  listInvitationsForUser(tx: Tx, userId: string) {
    return tx.membership.findMany({
      where: { userId, status: 'INVITED' },
      select: { role: true, createdAt: true, tenant: tenantRef },
      orderBy: { createdAt: 'asc' },
    });
  }

  listForTenant(tx: Tx, tenantId: string) {
    return tx.membership.findMany({
      where: { tenantId },
      select: memberSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  create(tx: Tx, data: Prisma.MembershipUncheckedCreateInput) {
    return tx.membership.create({ data, select: memberSelect });
  }

  update(tx: Tx, id: string, data: Prisma.MembershipUpdateInput) {
    return tx.membership.update({ where: { id }, data, select: memberSelect });
  }

  delete(tx: Tx, id: string) {
    return tx.membership.delete({ where: { id } });
  }
}

export const membershipRepository = new MembershipRepository();
