import type { z } from 'zod';
import type {
  createMovementSchema,
  inventoryCountSchema,
  listMovementsQuery,
  reverseMovementSchema,
} from '@/validations/inventory.validation';

export type CreateMovementDTO = z.infer<typeof createMovementSchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsQuery>;
export type InventoryCountDTO = z.infer<typeof inventoryCountSchema>;
export type ReverseMovementDTO = z.infer<typeof reverseMovementSchema>;

/** OK = acima do mínimo · LOW = no mínimo ou abaixo · OUT = zerado/negativo. */
export type StockStatus = 'OK' | 'LOW' | 'OUT';
