import type { Prisma } from '@prisma/client';
import type { Tx } from '@/config/database';

/** Auditoria: só inserção e leitura (o usuário da API não tem UPDATE/DELETE nesta tabela). */
export class AuditLogRepository {
  create(tx: Tx, data: Prisma.AuditLogUncheckedCreateInput) {
    return tx.auditLog.create({ data });
  }

  list(tx: Tx, where: Prisma.AuditLogWhereInput, take: number, skip: number) {
    return tx.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip });
  }

  count(tx: Tx, where: Prisma.AuditLogWhereInput) {
    return tx.auditLog.count({ where });
  }
}

export const auditLogRepository = new AuditLogRepository();
