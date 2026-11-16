import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOrigins, env } from '@/config/env';
import { errorHandlerMiddleware } from '@/middlewares/error-handler.middleware';
import { notFoundMiddleware } from '@/middlewares/not-found.middleware';
import { apiLimiter } from '@/middlewares/rate-limit.middleware';
import { routes } from '@/routes';
import { logger } from '@/utils/logger';

export const app = express();

// Atrás de proxy (Render/Railway) o rate limit precisa enxergar o IP real.
if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

// Uma vez por processo: mostra no log quantos proxies há na frente (para acertar TRUST_PROXY).
// Conta só os itens do X-Forwarded-For, sem registrar IPs.
let proxyHopsLogged = env.NODE_ENV !== 'production';
app.use((req, _res, next) => {
  if (!proxyHopsLogged && req.path !== '/api/health/live') {
    proxyHopsLogged = true;
    const hops = (req.headers['x-forwarded-for'] ?? '')
      .toString()
      .split(',')
      .filter(Boolean).length;
    logger.info('Proxies na frente da API', { xForwardedFor: hops, trustProxy: env.TRUST_PROXY });
  }
  next();
});

app.use(helmet());
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.use('/api', apiLimiter, routes);

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);
