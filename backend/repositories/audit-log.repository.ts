import type { Prisma } from '@prisma/client';
import type { Tx } from '@/config/database';

export class AuditLogRepository {
  create(tx: Tx, data: Prisma.AuditLogUncheckedCreateInput) {
    return tx.auditLog.create({ data });
  }
}

export const auditLogRepository = new AuditLogRepository();
