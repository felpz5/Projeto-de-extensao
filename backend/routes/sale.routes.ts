import { Router } from 'express';
import { saleController } from '@/controllers/sale.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { authorize, MANAGERS } from '@/middlewares/authorize.middleware';

export const saleRoutes = Router();

saleRoutes.use(authenticate);

/** Registrar venda: todos (é a tarefa do funcionário no balcão). */
saleRoutes.post('/', saleController.store);

// Histórico e relatórios: OWNER e MANAGER (planejamento, seção 4.3).
saleRoutes.get('/', authorize(...MANAGERS), saleController.index);
// (antes de "/:id" para não serem confundidos com um id)
saleRoutes.get('/summary', authorize(...MANAGERS), saleController.summary);
saleRoutes.get('/top-products', authorize(...MANAGERS), saleController.topProducts);
saleRoutes.get('/:id', authorize(...MANAGERS), saleController.show);
saleRoutes.delete('/:id', authorize(...MANAGERS), saleController.destroy);
