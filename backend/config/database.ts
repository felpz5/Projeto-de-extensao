import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

/** Cliente usado dentro de uma transação (é o que os repositórios recebem). */
export type Tx = Prisma.TransactionClient;

/** Quem está acessando: as políticas de RLS do Postgres usam esses valores. */
export interface DbContext {
  tenantId?: string;
  userId?: string;
}

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Executa `fn` numa transação com o estabelecimento e o usuário definidos no Postgres
 * (`app.tenant_id` / `app.user_id`). É a ÚNICA forma de acessar tabelas operacionais:
 * fora dela o RLS não devolve nem grava nenhuma linha.
 */
export function withContext<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId ?? ''}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`;
      return fn(tx);
    },
    { maxWait: 5_000, timeout: 20_000 },
  );
}

/** Avisa (ou impede, em produção) quando o usuário do banco ignora RLS. */
export async function checkDatabaseRole(): Promise<void> {
  const rows = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
    SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  const role = rows[0];
  if (role && (role.rolsuper || role.rolbypassrls)) {
    const msg =
      'O usuário do banco em DATABASE_URL ignora RLS (superuser/BYPASSRLS). ' +
      'Use o usuário gestock_app (prisma/sql/app-role.sql).';
    if (env.NODE_ENV === 'production') throw new Error(msg);
    logger.warn(msg);
  }
}
