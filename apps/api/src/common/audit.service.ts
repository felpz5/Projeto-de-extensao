import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Tx } from '../infra/prisma/prisma.service';
import { AuthContext } from './auth-context';

/** Registra ações sensíveis (ajustes, exclusões, mudanças de permissão). */
@Injectable()
export class AuditService {
  log(
    tx: Tx,
    auth: Pick<AuthContext, 'tenantId' | 'userId'>,
    action: string,
    entity: string,
    entityId?: string,
    payload?: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: { tenantId: auth.tenantId, userId: auth.userId, action, entity, entityId, payload },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
