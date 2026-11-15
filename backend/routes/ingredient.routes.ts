import { Router } from 'express';
import { ingredientController } from '@/controllers/ingredient.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { authorize, MANAGERS } from '@/middlewares/authorize.middleware';

/** Leitura: todos · escrita: OWNER e MANAGER. A lista inclui `stock` e `isLowStock`. */
export const ingredientRoutes = Router();

ingredientRoutes.use(authenticate);

ingredientRoutes.get('/', ingredientController.index);
ingredientRoutes.get('/:id', ingredientController.show);
ingredientRoutes.post('/', authorize(...MANAGERS), ingredientController.store);
ingredientRoutes.patch('/:id', authorize(...MANAGERS), ingredientController.update);
ingredientRoutes.delete('/:id', authorize(...MANAGERS), ingredientController.destroy);
