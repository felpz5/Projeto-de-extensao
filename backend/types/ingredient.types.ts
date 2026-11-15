import type { z } from 'zod';
import type {
  createIngredientSchema,
  listIngredientsQuery,
  updateIngredientSchema,
} from '@/validations/ingredient.validation';

export type CreateIngredientDTO = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientDTO = z.infer<typeof updateIngredientSchema>;
export type ListIngredientsQuery = z.infer<typeof listIngredientsQuery>;
