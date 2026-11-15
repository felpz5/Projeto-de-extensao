import type { Request, Response } from 'express';
import { productService } from '@/services/product.service';
import { uuid } from '@/validations/common.validation';
import {
  createProductSchema,
  listProductsQuery,
  setRecipeSchema,
  setWeightMixSchema,
  updateProductSchema,
} from '@/validations/product.validation';

export class ProductController {
  async index(req: Request, res: Response) {
    const query = listProductsQuery.parse(req.query);
    return res.json(await productService.list(req.user!, query));
  }

  async show(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    return res.json(await productService.getById(req.user!, id));
  }

  async store(req: Request, res: Response) {
    const data = createProductSchema.parse(req.body);
    return res.status(201).json(await productService.create(req.user!, data));
  }

  async update(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    const data = updateProductSchema.parse(req.body);
    return res.json(await productService.update(req.user!, id, data));
  }

  /** Responde se o produto foi apagado ou só desativado (por ter vendas). */
  async destroy(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    return res.json(await productService.remove(req.user!, id));
  }

  async setRecipe(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    const data = setRecipeSchema.parse(req.body);
    return res.json(await productService.setRecipe(req.user!, id, data));
  }

  async setWeightMix(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    const data = setWeightMixSchema.parse(req.body);
    return res.json(await productService.setWeightMix(req.user!, id, data));
  }
}

export const productController = new ProductController();
