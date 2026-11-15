import type { Request, Response } from 'express';
import { categoryService } from '@/services/category.service';
import {
  createCategorySchema,
  listCategoriesQuery,
  updateCategorySchema,
} from '@/validations/category.validation';
import { uuid } from '@/validations/common.validation';

export class CategoryController {
  async index(req: Request, res: Response) {
    const { kind } = listCategoriesQuery.parse(req.query);
    return res.json(await categoryService.list(req.user!, kind));
  }

  async store(req: Request, res: Response) {
    const data = createCategorySchema.parse(req.body);
    return res.status(201).json(await categoryService.create(req.user!, data));
  }

  async update(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    const data = updateCategorySchema.parse(req.body);
    return res.json(await categoryService.update(req.user!, id, data));
  }

  async destroy(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    await categoryService.remove(req.user!, id);
    return res.status(204).send();
  }
}

export const categoryController = new CategoryController();
