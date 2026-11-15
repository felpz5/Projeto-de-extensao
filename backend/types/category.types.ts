import type { z } from 'zod';
import type {
  createCategorySchema,
  listCategoriesQuery,
  updateCategorySchema,
} from '@/validations/category.validation';

export type CreateCategoryDTO = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDTO = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuery>;
