import type { Prisma } from '@prisma/client';
import { withContext, type Tx } from '@/config/database';
import { auditLogRepository, type AuditLogRepository } from '@/repositories/audit-log.repository';
import { userRepository, type UserRepository } from '@/repositories/user.repository';
import type { AuthContext } from '@/types/auth.types';

/** Registra ações sensíveis (ajustes, cancelamentos, mudanças de permissão) e as lista. */
export class AuditService {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly users: UserRepository,
  ) {}

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

  /** "Quem fez o quê e quando" no estabelecimento, do mais recente para o mais antigo. */
  list(auth: AuthContext, q: { entity?: string; userId?: string; take: number; skip: number }) {
    return withContext(auth, async (tx) => {
      const where: Prisma.AuditLogWhereInput = {
        tenantId: auth.tenantId,
        entity: q.entity,
        userId: q.userId,
      };
      const [items, total] = await Promise.all([
        this.repository.list(tx, where, q.take, q.skip),
        this.repository.count(tx, where),
      ]);
      const names = await this.users.namesById(items.map((i) => i.userId));
      return {
        items: items.map((i) => ({
          ...i,
          userName: i.userId ? (names.get(i.userId) ?? null) : null,
        })),
        total,
        take: q.take,
        skip: q.skip,
      };
    });
  }

  /** Lançamentos de auditoria de uma ação (ex.: histórico de contagens de estoque). */
  findByAction(tx: Tx, tenantId: string, action: string, take: number, skip: number) {
    const where = { tenantId, action };
    return Promise.all([
      this.repository.list(tx, where, take, skip),
      this.repository.count(tx, where),
    ]);
  }
}

export const auditService = new AuditService(auditLogRepository, userRepository);
