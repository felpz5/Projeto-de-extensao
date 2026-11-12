import { z } from 'zod';
import { nonNegative, positive, uuid } from '../../common/schemas';

const name = z.string().trim().min(1).max(120);

// ---------- Categorias ----------
export const createCategorySchema = z
  .object({ name, kind: z.enum(['PRODUCT', 'INGREDIENT']) })
  .strict();
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({ name }).strict();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const listCategoriesQuery = z
  .object({ kind: z.enum(['PRODUCT', 'INGREDIENT']).optional() })
  .strict();

// ---------- Ingredientes ----------
const ingredientFields = {
  name,
  categoryId: uuid.nullable().optional(),
  /** G = gramas, ML = mililitros, UN = unidades. Todas as quantidades usam essa unidade. */
  baseUnit: z.enum(['G', 'ML', 'UN']),
  minStock: nonNegative.optional(),
  costPerUnit: nonNegative.nullable().optional(),
  leadTimeDays: z.number().int().min(0).max(90).optional(),
  /** Porção padrão por uso (ex.: 40 g de creme). Usada para ESTIMAR consumo em pedidos online. */
  defaultPortion: positive.nullable().optional(),
  active: z.boolean().optional(),
};

export const createIngredientSchema = z.object(ingredientFields).strict();
export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;

export const updateIngredientSchema = z
  .object(ingredientFields)
  .partial()
  .omit({ baseUnit: true })
  .strict();
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;

export const listIngredientsQuery = z
  .object({
    search: z.string().trim().max(120).optional(),
    active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    categoryId: uuid.optional(),
  })
  .strict();
export type ListIngredientsQuery = z.infer<typeof listIngredientsQuery>;

// ---------- Produtos ----------
const productFields = {
  name,
  categoryId: uuid.nullable().optional(),
  /** UNIT = preço por unidade · WEIGHT = preço por kg */
  pricingMode: z.enum(['UNIT', 'WEIGHT']),
  price: nonNegative,
  active: z.boolean().optional(),
};

export const createProductSchema = z.object(productFields).strict();
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object(productFields)
  .partial()
  .omit({ pricingMode: true })
  .strict();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsQuery = z
  .object({
    search: z.string().trim().max(120).optional(),
    active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    categoryId: uuid.optional(),
  })
  .strict();
export type ListProductsQuery = z.infer<typeof listProductsQuery>;

const uniqueIngredients = (items: { ingredientId: string }[]) =>
  new Set(items.map((i) => i.ingredientId)).size === items.length;

/** Receita: quantidade de cada ingrediente para 1 unidade do produto. Substitui a receita atual. */
export const setRecipeSchema = z
  .object({
    items: z
      .array(z.object({ ingredientId: uuid, quantity: positive }).strict())
      .max(100)
      .refine(uniqueIngredients, 'Ingrediente repetido na receita'),
  })
  .strict();
export type SetRecipeInput = z.infer<typeof setRecipeSchema>;

/** Composição média (%) de um produto vendido por peso. Usada só para estimativas. */
export const setWeightMixSchema = z
  .object({
    items: z
      .array(
        z.object({ ingredientId: uuid, percentage: z.number().gt(0).max(100) }).strict(),
      )
      .max(50)
      .refine(uniqueIngredients, 'Ingrediente repetido na composição')
      .refine(
        (items) => items.reduce((s, i) => s + i.percentage, 0) <= 100.0001,
        'A soma dos percentuais não pode passar de 100%',
      ),
  })
  .strict();
export type SetWeightMixInput = z.infer<typeof setWeightMixSchema>;
