import type { Request, Response } from 'express';
import { prisma } from '@/config/database';

export class HealthController {
  /** Status da API e do banco. Banco fora do ar = 503 (o que o Render/Railway esperam). */
  async check(_req: Request, res: Response) {
    const time = new Date().toISOString();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return res.json({ status: 'ok', database: 'ok', time });
    } catch {
      return res.status(503).json({ status: 'error', database: 'unreachable', time });
    }
  }
}

export const healthController = new HealthController();
