import { Router } from 'express';
import { dashboardController } from '@/controllers/dashboard.controller';
import { authenticate } from '@/middlewares/auth.middleware';

/** Visão geral (sugestões de reposição só para OWNER/MANAGER). */
export const dashboardRoutes = Router();

dashboardRoutes.use(authenticate);

dashboardRoutes.get('/', dashboardController.overview);
