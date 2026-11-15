import { z } from 'zod';

const name = z.string().trim().min(1).max(120);
const kind = z.enum(['PRODUCT', 'INGREDIENT']);

export const createCategorySchema = z.object({ name, kind }).strict();

export const updateCategorySchema = z.object({ name }).strict();

export const listCategoriesQuery = z.object({ kind: kind.optional() }).strict();
