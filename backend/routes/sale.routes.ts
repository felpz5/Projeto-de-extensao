import { Router } from 'express';
import { saleImportController } from '@/controllers/sale-import.controller';
import { saleController } from '@/controllers/sale.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { authorize, MANAGERS } from '@/middlewares/authorize.middleware';

export const saleRoutes = Router();

saleRoutes.use(authenticate);

/** Registrar venda: todos (é a tarefa do funcionário no balcão). */
saleRoutes.post('/', saleController.store);

/** Fechamento de caixa: todos (funcionário vê só o próprio caixa; checado no service). */
saleRoutes.get('/cash', saleController.cash);

// Histórico e relatórios da loja: OWNER e MANAGER (planejamento, seção 4.3).
saleRoutes.get('/', authorize(...MANAGERS), saleController.index);
// (antes de "/:id" para não serem confundidos com um id)
saleRoutes.get('/summary', authorize(...MANAGERS), saleController.summary);
saleRoutes.get('/top-products', authorize(...MANAGERS), saleController.topProducts);

// Importação de histórico (CSV): OWNER e MANAGER.
saleRoutes.post('/import/preview', authorize(...MANAGERS), saleImportController.preview);
saleRoutes.post('/import', authorize(...MANAGERS), saleImportController.commit);
saleRoutes.get('/imports', authorize(...MANAGERS), saleImportController.list);
saleRoutes.post('/imports/:id/undo', authorize(...MANAGERS), saleImportController.undo);

/**
 * Detalhe, cancelamento e correção: dono/gerente em qualquer venda; funcionário só na própria
 * e só nos primeiros minutos (regras no service). Venda nunca é apagada.
 */
saleRoutes.get('/:id', saleController.show);
saleRoutes.post('/:id/cancel', saleController.cancel);
saleRoutes.post('/:id/correct', saleController.correct);
