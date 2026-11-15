import { z } from 'zod';
import {
  booleanQuery,
  quantity,
  stockLimit,
  unitCost,
  uuid,
} from '@/validations/common.validation';

const ingredientFields = {
  name: z.string().trim().min(1).max(120),
  categoryId: uuid.nullable().optional(),
  /** G = gramas, ML = mililitros, UN = unidades. Todas as quantidades usam essa unidade. */
  baseUnit: z.enum(['G', 'ML', 'UN']),
  minStock: stockLimit.optional(),
  costPerUnit: unitCost.nullable().optional(),
  leadTimeDays: z.number().int().min(0).max(90).optional(),
  /** Porção padrão por uso (ex.: 40 g de creme). Usada para ESTIMAR consumo em pedidos online. */
  defaultPortion: quantity.nullable().optional(),
  active: z.boolean().optional(),
};

export const createIngredientSchema = z.object(ingredientFields).strict();

export const updateIngredientSchema = z
  .object(ingredientFields)
  .partial()
  .omit({ baseUnit: true })
  .strict();

export const listIngredientsQuery = z
  .object({
    search: z.string().trim().max(120).optional(),
    active: booleanQuery,
    categoryId: uuid.optional(),
  })
  .strict();
