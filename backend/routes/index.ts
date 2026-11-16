import { Router } from 'express';
import { healthController } from '@/controllers/health.controller';
import { authRoutes } from '@/routes/auth.routes';
import { categoryRoutes } from '@/routes/category.routes';
import { dashboardRoutes } from '@/routes/dashboard.routes';
import { forecastRoutes } from '@/routes/forecast.routes';
import { ingredientRoutes } from '@/routes/ingredient.routes';
import { inventoryRoutes } from '@/routes/inventory.routes';
import { productRoutes } from '@/routes/product.routes';
import { saleRoutes } from '@/routes/sale.routes';
import { tenantRoutes } from '@/routes/tenant.routes';

/** Todas as rotas da API (montadas em /api no app.ts). */
export const routes = Router();

routes.get('/health', healthController.check);
routes.get('/health/live', healthController.live);

routes.use('/auth', authRoutes);
routes.use('/tenant', tenantRoutes);
routes.use('/categories', categoryRoutes);
routes.use('/ingredients', ingredientRoutes);
routes.use('/products', productRoutes);
routes.use('/inventory', inventoryRoutes);
routes.use('/sales', saleRoutes);
routes.use('/forecast', forecastRoutes);
routes.use('/dashboard', dashboardRoutes);
