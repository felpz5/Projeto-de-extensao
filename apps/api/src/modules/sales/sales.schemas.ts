import { z } from 'zod';
import { isoDate, nonNegative, pagination, positive, uuid } from '../../common/schemas';

const saleItemSchema = z
  .object({
    productId: uuid,
    quantity: positive.default(1),
    /** Valor de 1 unidade. Se omitido: preço do produto (UNIT) ou preço/kg × peso (WEIGHT). */
    unitPrice: nonNegative.optional(),
    weightG: positive.optional(),
    /** Ingredientes escolhidos pelo cliente. Informe `quantity` só se foi realmente medida. */
    ingredients: z
      .array(z.object({ ingredientId: uuid, quantity: positive.optional() }).strict())
      .max(50)
      .refine(
        (list) => new Set(list.map((i) => i.ingredientId)).size === list.length,
        'Ingrediente repetido no item',
      )
      .optional(),
  })
  .strict();

export const createSaleSchema = z
  .object({
    channel: z.enum(['IN_STORE', 'ONLINE']),
    soldAt: isoDate.optional(),
    /** Valor cobrado (ex.: anotado no caderno). Se omitido, soma dos itens. */
    totalAmount: nonNegative.optional(),
    /** Peso total do pote informado pela balança. */
    totalWeightG: positive.optional(),
    notes: z.string().trim().max(500).optional(),
    items: z.array(saleItemSchema).min(1, 'A venda precisa de pelo menos um item').max(50),
  })
  .strict()
  .refine((s) => !s.soldAt || s.soldAt.getTime() <= Date.now() + 5 * 60_000, {
    message: 'A data da venda não pode estar no futuro',
    path: ['soldAt'],
  });
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const listSalesQuery = z
  .object({
    channel: z.enum(['IN_STORE', 'ONLINE']).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    productId: uuid.optional(),
    ...pagination,
  })
  .strict();
export type ListSalesQuery = z.infer<typeof listSalesQuery>;

export const periodQuery = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict();
export type PeriodQuery = z.infer<typeof periodQuery>;
