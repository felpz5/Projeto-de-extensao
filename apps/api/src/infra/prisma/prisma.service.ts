import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { Env } from '../../config/env';

export type Tx = Prisma.TransactionClient;

export interface DbContext {
  tenantId?: string;
  userId?: string;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    await this.checkRlsRole();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Executa `fn` numa transação com o contexto do tenant/usuário definido no Postgres.
   * As políticas de RLS usam esses valores: é a única forma de acessar dados operacionais.
   */
  withContext<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId ?? ''}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`;
        return fn(tx);
      },
      { maxWait: 5_000, timeout: 20_000 },
    );
  }

  /** Avisa (ou impede, em produção) quando o usuário do banco ignora RLS. */
  private async checkRlsRole() {
    const rows = await this.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    const role = rows[0];
    if (role && (role.rolsuper || role.rolbypassrls)) {
      const msg =
        'O usuário do banco em DATABASE_URL ignora RLS (superuser/BYPASSRLS). ' +
        'Use o usuário gestock_app (prisma/sql/app-role.sql).';
      if (this.config.get('NODE_ENV', { infer: true }) === 'production') throw new Error(msg);
      this.logger.warn(msg);
    }
  }
}
