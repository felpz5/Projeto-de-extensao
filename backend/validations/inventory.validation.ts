import { z } from 'zod';
import {
  booleanQuery,
  dateFilter,
  pagination,
  pastTimestamp,
  signedQuantity,
  stockLimit,
  unitCost,
  uuid,
} from '@/validations/common.validation';

/** Tipos que podem ser lançados manualmente (SALE_CONSUMPTION é gerado pelas vendas). */
export const manualMovementType = z.enum([
  'INITIAL',
  'PURCHASE',
  'MANUAL_OUT',
  'LOSS',
  'ADJUSTMENT',
]);

/**
 * O funcionário (STAFF) só lança COMPRA (mercadoria que chegou). Estoque inicial, saídas,
 * perdas e ajustes ficam com gerente/dono: um "estoque inicial" a qualquer momento inflaria o saldo.
 */
export const STAFF_MOVEMENT_TYPES = ['PURCHASE'] as const;

export const createMovementSchema = z
  .object({
    ingredientId: uuid,
    type: manualMovementType,
    /**
     * Sempre na unidade base do ingrediente.
     * INITIAL/PURCHASE/MANUAL_OUT/LOSS: informe valor positivo (saídas são gravadas como negativas).
     * ADJUSTMENT: informe a diferença com sinal (+ ou −).
     */
    quantity: signedQuantity,
    unitCost: unitCost.optional(),
    /** Quando aconteceu (padrão: agora). Não pode estar no futuro. */
    occurredAt: pastTimestamp.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((m) => m.type === 'ADJUSTMENT' || m.quantity > 0, {
    message: 'Informe uma quantidade positiva (o sinal é definido pelo tipo)',
    path: ['quantity'],
  });

export const listMovementsQuery = z
  .object({
    ingredientId: uuid.optional(),
    type: z
      .enum(['INITIAL', 'PURCHASE', 'SALE_CONSUMPTION', 'MANUAL_OUT', 'LOSS', 'ADJUSTMENT'])
      .optional(),
    estimated: booleanQuery,
    from: dateFilter.optional(),
    to: dateFilter.optional(),
    ...pagination,
  })
  .strict();

export const reverseMovementSchema = z
  .object({ note: z.string().trim().max(500).optional() })
  .strict();

/** Contagem física: o sistema lança um ajuste com a diferença para cada item. */
export const inventoryCountSchema = z
  .object({
    items: z
      .array(z.object({ ingredientId: uuid, countedQuantity: stockLimit }).strict())
      .min(1)
      .max(500)
      .refine(
        (items) => new Set(items.map((i) => i.ingredientId)).size === items.length,
        'Ingrediente repetido na contagem',
      ),
    /** Quando a contagem foi feita (padrão: agora). A diferença é calculada contra o saldo NESSE momento. */
    occurredAt: pastTimestamp.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

/** Relatório de perdas e ajustes de um período. */
export const stockReportQuery = z
  .object({ from: dateFilter.optional(), to: dateFilter.optional() })
  .strict();

export const countHistoryQuery = z.object({ ...pagination }).strict();
