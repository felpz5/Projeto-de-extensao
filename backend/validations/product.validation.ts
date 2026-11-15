import { z } from 'zod';
import { booleanQuery, money, percentage, quantity, uuid } from '@/validations/common.validation';

const productFields = {
  name: z.string().trim().min(1).max(120),
  categoryId: uuid.nullable().optional(),
  /** UNIT = preço por unidade · WEIGHT = preço por kg */
  pricingMode: z.enum(['UNIT', 'WEIGHT']),
  price: money,
  active: z.boolean().optional(),
};

export const createProductSchema = z.object(productFields).strict();

export const updateProductSchema = z
  .object(productFields)
  .partial()
  .omit({ pricingMode: true })
  .strict();

export const listProductsQuery = z
  .object({
    search: z.string().trim().max(120).optional(),
    active: booleanQuery,
    categoryId: uuid.optional(),
  })
  .strict();

const uniqueIngredients = (items: { ingredientId: string }[]) =>
  new Set(items.map((i) => i.ingredientId)).size === items.length;

/** Receita: quantidade de cada ingrediente para 1 unidade do produto. Substitui a receita atual. */
export const setRecipeSchema = z
  .object({
    items: z
      .array(z.object({ ingredientId: uuid, quantity }).strict())
      .max(100)
      .refine(uniqueIngredients, 'Ingrediente repetido na receita'),
  })
  .strict();

/** Composição média (%) de um produto vendido por peso. Usada só para estimativas. */
export const setWeightMixSchema = z
  .object({
    items: z
      .array(z.object({ ingredientId: uuid, percentage }).strict())
      .max(50)
      .refine(uniqueIngredients, 'Ingrediente repetido na composição')
      .refine(
        (items) => items.reduce((s, i) => s + i.percentage, 0) <= 100.0001,
        'A soma dos percentuais não pode passar de 100%',
      ),
  })
  .strict();
