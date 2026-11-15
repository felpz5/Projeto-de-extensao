import { rateLimit } from 'express-rate-limit';
import { env } from '@/config/env';

/**
 * Limites de requisições por IP (contadores em memória: valem por instância da API).
 * Desligados nos testes.
 */
function limiter(windowMs: number, limit: number, skipPath?: string) {
  const minutes = Math.ceil(windowMs / 60_000);
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => env.NODE_ENV === 'test' || (skipPath !== undefined && req.path === skipPath),
    handler: (_req, res) => {
      res.status(429).json({
        message: `Muitas requisições. Aguarde ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} e tente novamente.`,
      });
    },
  });
}

/** Toda a API: 120 requisições por minuto (o health check não conta). */
export const apiLimiter = limiter(60_000, 120, '/health');

/** Cadastro e login: 5 por minuto. */
export const registerLimiter = limiter(60_000, 5);
export const loginLimiter = limiter(60_000, 5);
export const changePasswordLimiter = limiter(60_000, 5);

/** Renovação de sessão: 30 por minuto. */
export const refreshLimiter = limiter(60_000, 30);
