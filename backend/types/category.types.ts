import type { z } from 'zod';
import type { createCategorySchema, updateCategorySchema } from '@/validations/category.validation';

export type CreateCategoryDTO = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDTO = z.infer<typeof updateCategorySchema>;
