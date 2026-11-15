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

export const paymentMethod = z.enum([
  'CASH',
  'PIX',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'VOUCHER',
  'OTHER',
]);

/** Por quantos minutos o funcionário pode cancelar/corrigir a própria venda. */
export const STAFF_SALE_EDIT_MINUTES = 15;

export const createSaleSchema = z
  .object({
    channel: z.enum(['IN_STORE', 'ONLINE']),
    /** Opcional na API (vendas antigas e integrações); o front sempre envia. */
    paymentMethod: paymentMethod.optional(),
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
    status: z.enum(['COMPLETED', 'CANCELED']).optional(),
    paymentMethod: paymentMethod.optional(),
    from: dateFilter.optional(),
    to: dateFilter.optional(),
    productId: uuid.optional(),
    ...pagination,
  })
  .strict();

/** Cancelar venda: o motivo fica registrado (auditoria) e o estoque é estornado. */
export const cancelSaleSchema = z
  .object({ reason: z.string().trim().min(3, 'Informe o motivo').max(300) })
  .strict();

/** Fechamento de caixa de um dia (no fuso do estabelecimento). */
export const cashQuery = z
  .object({
    date: z.string().date('Data inválida: use 2026-11-30').optional(),
    /** Só para dono/gerente: caixa de uma pessoa. Funcionário sempre vê só o próprio. */
    userId: uuid.optional(),
  })
  .strict();
