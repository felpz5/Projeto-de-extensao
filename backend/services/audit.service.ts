import type { Prisma } from '@prisma/client';
import type { Tx } from '@/config/database';
import { auditLogRepository, type AuditLogRepository } from '@/repositories/audit-log.repository';
import type { AuthContext } from '@/types/auth.types';

/** Registra ações sensíveis (ajustes, exclusões, mudanças de permissão). */
export class AuditService {
  constructor(private readonly repository: AuditLogRepository) {}

  log(
    tx: Tx,
    requester: Pick<AuthContext, 'tenantId' | 'userId'>,
    action: string,
    entity: string,
    entityId?: string,
    payload?: Prisma.InputJsonValue,
  ) {
    return this.repository.create(tx, {
      tenantId: requester.tenantId,
      userId: requester.userId,
      action,
      entity,
      entityId,
      payload,
    });
  }
}

export const auditService = new AuditService(auditLogRepository);
