import { Prisma } from '@prisma/client';
import { Tx } from '../../infra/prisma/prisma.service';

/** Saldo atual (soma das movimentações) por ingrediente. Sem movimentação = 0. */
export async function stockLevels(
  tx: Tx,
  tenantId: string,
  ingredientIds?: string[],
): Promise<Map<string, Prisma.Decimal>> {
  const rows = await tx.stockMovement.groupBy({
    by: ['ingredientId'],
    where: { tenantId, ...(ingredientIds ? { ingredientId: { in: ingredientIds } } : {}) },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.ingredientId, r._sum.quantity ?? new Prisma.Decimal(0)]));
}

export const ZERO = new Prisma.Decimal(0);
