import { app } from '@/app';
import { checkDatabaseRole, prisma } from '@/config/database';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

async function bootstrap() {
  await prisma.$connect();
  await checkDatabaseRole();

  const server = app.listen(env.PORT, () => {
    logger.info(`Gestock API rodando em http://localhost:${env.PORT}/api`);
  });

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
