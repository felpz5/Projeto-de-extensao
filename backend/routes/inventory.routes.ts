import { Router } from 'express';
import { inventoryController } from '@/controllers/inventory.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { authorize, MANAGERS } from '@/middlewares/authorize.middleware';

export const inventoryRoutes = Router();

inventoryRoutes.use(authenticate);

inventoryRoutes.get('/levels', inventoryController.levels);
inventoryRoutes.get('/low-stock', inventoryController.lowStock);

inventoryRoutes.get('/movements', inventoryController.listMovements);
/** STAFF lança só entradas (INITIAL/PURCHASE); saídas, perdas e ajustes: OWNER/MANAGER (checado no service). */
inventoryRoutes.post('/movements', inventoryController.createMovement);
/** Estorno de lançamento manual (o livro-razão nunca apaga nada). */
inventoryRoutes.post(
  '/movements/:id/reverse',
  authorize(...MANAGERS),
  inventoryController.reverseMovement,
);

/** Contagem física → ajustes com a diferença. */
inventoryRoutes.post('/counts', authorize(...MANAGERS), inventoryController.count);
