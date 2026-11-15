import { app } from '@/app';
import { checkDatabaseRole, prisma } from '@/config/database';
import { env } from '@/config/env';
import { refreshTokenRepository } from '@/repositories/refresh-token.repository';
import { logger } from '@/utils/logger';

const SIX_HOURS = 6 * 60 * 60_000;

/** Limpeza periódica de sessões vencidas (a tabela não cresce sem limite). */
async function purgeSessions() {
  try {
    const removed = await refreshTokenRepository.purgeStale();
    if (removed) logger.info(`Sessões antigas removidas: ${removed}`);
  } catch (error) {
    logger.error('Falha ao limpar sessões antigas', { message: (error as Error).message });
  }
}

async function bootstrap() {
  await prisma.$connect();
  await checkDatabaseRole();

  const server = app.listen(env.PORT, () => {
    logger.info(`Gestock API rodando em http://localhost:${env.PORT}/api`);
  });

  if (env.NODE_ENV !== 'test') {
    void purgeSessions();
    setInterval(() => void purgeSessions(), SIX_HOURS).unref();
  }

  const shutdown = (signal: string) => {
    logger.info(`${signal} recebido, encerrando...`);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error: Error) => {
  logger.error('Falha ao iniciar a API', { message: error.message });
  process.exit(1);
});
