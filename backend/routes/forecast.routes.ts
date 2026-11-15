import { Router } from 'express';
import { forecastController } from '@/controllers/forecast.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { authorize, MANAGERS } from '@/middlewares/authorize.middleware';

/** Previsão e reposição: só OWNER e MANAGER. */
export const forecastRoutes = Router();

forecastRoutes.use(authenticate, authorize(...MANAGERS));

forecastRoutes.get('/products', forecastController.products);
forecastRoutes.get('/reorder', forecastController.reorder);
