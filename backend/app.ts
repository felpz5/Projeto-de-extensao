import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOrigins, env } from '@/config/env';
import { errorHandlerMiddleware } from '@/middlewares/error-handler.middleware';
import { notFoundMiddleware } from '@/middlewares/not-found.middleware';
import { apiLimiter } from '@/middlewares/rate-limit.middleware';
import { routes } from '@/routes';

export const app = express();

// Atrás de proxy (Render/Railway) o rate limit precisa enxergar o IP real.
if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

app.use(helmet());
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.use('/api', apiLimiter, routes);

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);
