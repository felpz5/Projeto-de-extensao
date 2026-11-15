import type { Request, Response } from 'express';
import { ingredientService } from '@/services/ingredient.service';
import { uuid } from '@/validations/common.validation';
import {
  createIngredientSchema,
  listIngredientsQuery,
  updateIngredientSchema,
} from '@/validations/ingredient.validation';

export class IngredientController {
  async index(req: Request, res: Response) {
    const query = listIngredientsQuery.parse(req.query);
    return res.json(await ingredientService.list(req.user!, query));
  }

  async show(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    return res.json(await ingredientService.getById(req.user!, id));
  }

  async store(req: Request, res: Response) {
    const data = createIngredientSchema.parse(req.body);
    return res.status(201).json(await ingredientService.create(req.user!, data));
  }

  async update(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    const data = updateIngredientSchema.parse(req.body);
    return res.json(await ingredientService.update(req.user!, id, data));
  }

  /** Responde se o ingrediente foi apagado ou só desativado (por ter histórico). */
  async destroy(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    return res.json(await ingredientService.remove(req.user!, id));
  }
}

export const ingredientController = new IngredientController();
