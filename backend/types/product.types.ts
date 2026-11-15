import type { z } from 'zod';
import type {
  createProductSchema,
  listProductsQuery,
  setRecipeSchema,
  setWeightMixSchema,
  updateProductSchema,
} from '@/validations/product.validation';

export type CreateProductDTO = z.infer<typeof createProductSchema>;
export type UpdateProductDTO = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuery>;
export type SetRecipeDTO = z.infer<typeof setRecipeSchema>;
export type SetWeightMixDTO = z.infer<typeof setWeightMixSchema>;
