import { z } from 'zod';
import { isoDate, nonNegative, pagination, uuid } from '../../common/schemas';

/** Tipos que podem ser lançados manualmente (SALE_CONSUMPTION é gerado pelas vendas). */
export const manualMovementType = z.enum(['INITIAL', 'PURCHASE', 'MANUAL_OUT', 'LOSS', 'ADJUSTMENT']);

export const createMovementSchema = z
  .object({
    ingredientId: uuid,
    type: manualMovementType,
    /**
     * Sempre na unidade base do ingrediente.
     * INITIAL/PURCHASE/MANUAL_OUT/LOSS: informe valor positivo (saídas são gravadas como negativas).
     * ADJUSTMENT: informe a diferença com sinal (+ ou −).
     */
    quantity: z.number().refine((n) => n !== 0, 'Quantidade não pode ser zero'),
    unitCost: nonNegative.optional(),
    occurredAt: isoDate.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((m) => m.type === 'ADJUSTMENT' || m.quantity > 0, {
    message: 'Informe uma quantidade positiva (o sinal é definido pelo tipo)',
    path: ['quantity'],
  });
export type CreateMovementInput = z.infer<typeof createMovementSchema>;

export const listMovementsQuery = z
  .object({
    ingredientId: uuid.optional(),
    type: z
      .enum(['INITIAL', 'PURCHASE', 'SALE_CONSUMPTION', 'MANUAL_OUT', 'LOSS', 'ADJUSTMENT'])
      .optional(),
    estimated: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    ...pagination,
  })
  .strict();
export type ListMovementsQuery = z.infer<typeof listMovementsQuery>;

/** Contagem física: o sistema lança um ajuste com a diferença para cada item. */
export const inventoryCountSchema = z
  .object({
    items: z
      .array(z.object({ ingredientId: uuid, countedQuantity: nonNegative }).strict())
      .min(1)
      .max(500)
      .refine(
        (items) => new Set(items.map((i) => i.ingredientId)).size === items.length,
        'Ingrediente repetido na contagem',
      ),
    occurredAt: isoDate.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type InventoryCountInput = z.infer<typeof inventoryCountSchema>;
