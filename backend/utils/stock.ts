import type { Prisma } from '@prisma/client';
import type { StockStatus } from '@/types/inventory.types';

/**
 * Status do saldo (a mesma regra em toda a API):
 * OUT = zerado ou negativo · LOW = no mínimo ou abaixo · OK = acima do mínimo.
 */
export function stockStatus(stock: Prisma.Decimal, minStock: Prisma.Decimal): StockStatus {
  if (stock.lte(0)) return 'OUT';
  if (minStock.gt(0) && stock.lte(minStock)) return 'LOW';
  return 'OK';
}
