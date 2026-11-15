import { Prisma } from '@prisma/client';
import type { Tx } from '@/config/database';

const ingredientRef = { select: { id: true, name: true, baseUnit: true } } as const;

/**
 * Livro-razão do estoque: o saldo é sempre a soma das movimentações.
 * Lançamentos nunca são apagados: um erro é corrigido com um ESTORNO (movimentação inversa).
 */
export class StockMovementRepository {
  create(tx: Tx, data: Prisma.StockMovementUncheckedCreateInput) {
    return tx.stockMovement.create({ data, include: { ingredient: ingredientRef } });
  }

  createMany(tx: Tx, data: Prisma.StockMovementCreateManyInput[]) {
    return tx.stockMovement.createMany({ data });
  }

  findById(tx: Tx, tenantId: string, id: string) {
    return tx.stockMovement.findFirst({ where: { id, tenantId } });
  }

  /** Marca como estornada, só se ainda não estiver (evita estorno duplo em requisições simultâneas). */
  async markReversed(tx: Tx, id: string): Promise<boolean> {
    const { count } = await tx.stockMovement.updateMany({
      where: { id, reversedAt: null },
      data: { reversedAt: new Date() },
    });
    return count === 1;
  }

  list(tx: Tx, where: Prisma.StockMovementWhereInput, take: number, skip: number) {
    return tx.stockMovement.findMany({
      where,
      include: { ingredient: ingredientRef },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take,
      skip,
    });
  }

  listRecent(tx: Tx, tenantId: string, take: number) {
    return this.list(tx, { tenantId }, take, 0);
  }

  count(tx: Tx, where: Prisma.StockMovementWhereInput) {
    return tx.stockMovement.count({ where });
  }

  /** Movimentações que valem (nem estornadas, nem estornos) de um ingrediente. */
  countEffectiveForIngredient(tx: Tx, ingredientId: string) {
    return tx.stockMovement.count({
      where: { ingredientId, reversedAt: null, reversesId: null },
    });
  }

  /**
   * Saldo por ingrediente (soma das movimentações). Sem movimentação = não aparece.
   * Com `asOf`, considera só o que aconteceu até aquele instante (ex.: contagem retroativa).
   */
  async balances(
    tx: Tx,
    tenantId: string,
    ingredientIds?: string[],
    asOf?: Date,
  ): Promise<Map<string, Prisma.Decimal>> {
    const rows = await tx.stockMovement.groupBy({
      by: ['ingredientId'],
      where: {
        tenantId,
        ...(ingredientIds ? { ingredientId: { in: ingredientIds } } : {}),
        ...(asOf ? { occurredAt: { lte: asOf } } : {}),
      },
      _sum: { quantity: true },
    });
    return new Map(rows.map((r) => [r.ingredientId, r._sum.quantity ?? new Prisma.Decimal(0)]));
  }
}

export const stockMovementRepository = new StockMovementRepository();
