import { Router } from 'express';
import { productController } from '@/controllers/product.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { authorize, MANAGERS } from '@/middlewares/authorize.middleware';

/** Leitura: todos · escrita, receita e composição: OWNER e MANAGER. */
export const productRoutes = Router();

productRoutes.use(authenticate);

productRoutes.get('/', productController.index);
productRoutes.get('/:id', productController.show);
productRoutes.post('/', authorize(...MANAGERS), productController.store);
productRoutes.patch('/:id', authorize(...MANAGERS), productController.update);
productRoutes.delete('/:id', authorize(...MANAGERS), productController.destroy);

/** Receita fixa (produtos UNIT). */
productRoutes.put('/:id/recipe', authorize(...MANAGERS), productController.setRecipe);
/** Composição média % (produtos WEIGHT, ingredientes em g). */
productRoutes.put('/:id/weight-mix', authorize(...MANAGERS), productController.setWeightMix);
