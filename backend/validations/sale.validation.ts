import { z } from 'zod';
import {
  dateFilter,
  itemQuantity,
  money,
  pagination,
  pastTimestamp,
  quantity,
  uuid,
  weightG,
} from '@/validations/common.validation';

const saleItemSchema = z
  .object({
    productId: uuid,
    quantity: itemQuantity.default(1),
    /** Valor de 1 unidade. Se omitido: preço do produto (UNIT) ou preço/kg × peso (WEIGHT). */
    unitPrice: money.optional(),
    weightG: weightG.optional(),
    /**
     * Ingredientes escolhidos pelo cliente. Informe `quantity` só se foi realmente medida:
     * é o TOTAL usado no item (não é multiplicado pela quantidade do item).
     * Sem `quantity`, vale a porção padrão × quantidade do item.
     */
    ingredients: z
      .array(z.object({ ingredientId: uuid, quantity: quantity.optional() }).strict())
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
    /** Quando foi vendida (padrão: agora). Não pode estar no futuro. */
    soldAt: pastTimestamp.optional(),
    /** Valor cobrado (ex.: anotado no caderno). Se omitido, soma dos itens. */
    totalAmount: money.optional(),
    /** Peso total do pote informado pela balança. */
    totalWeightG: weightG.optional(),
    notes: z.string().trim().max(500).optional(),
    items: z.array(saleItemSchema).min(1, 'A venda precisa de pelo menos um item').max(50),
  })
  .strict();

export const listSalesQuery = z
  .object({
    channel: z.enum(['IN_STORE', 'ONLINE']).optional(),
    from: dateFilter.optional(),
    to: dateFilter.optional(),
    productId: uuid.optional(),
    ...pagination,
  })
  .strict();
