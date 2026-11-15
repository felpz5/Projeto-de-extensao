import { Router } from 'express';
import { categoryController } from '@/controllers/category.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { authorize, MANAGERS } from '@/middlewares/authorize.middleware';

/** Leitura: todos · escrita: OWNER e MANAGER. */
export const categoryRoutes = Router();

categoryRoutes.use(authenticate);

categoryRoutes.get('/', categoryController.index);
categoryRoutes.post('/', authorize(...MANAGERS), categoryController.store);
categoryRoutes.patch('/:id', authorize(...MANAGERS), categoryController.update);
categoryRoutes.delete('/:id', authorize(...MANAGERS), categoryController.destroy);
