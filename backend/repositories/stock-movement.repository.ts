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
  /**
   * Relatório do período por ingrediente: compras, consumo das vendas (e quanto foi estimado),
   * saídas, perdas e ajustes de inventário. Estornados e estornos ficam de fora.
   * Quantidades positivas (o ajuste mantém o sinal: − = sumiu mais do que o registrado).
   */
  periodReport(tx: Tx, tenantId: string, from: Date, to: Date) {
    return tx.$queryRaw<
      {
        ingredientId: string;
        name: string;
        baseUnit: 'G' | 'ML' | 'UN';
        costPerUnit: Prisma.Decimal | null;
        purchased: number;
        consumed: number;
        consumedEstimated: number;
        manualOut: number;
        lost: number;
        adjusted: number;
        adjustments: number;
      }[]
    >`
      SELECT i.id AS "ingredientId", i.name, i.base_unit AS "baseUnit", i.cost_per_unit AS "costPerUnit",
             COALESCE(SUM(m.quantity) FILTER (WHERE m.type = 'PURCHASE'), 0)::float8 AS purchased,
             COALESCE(SUM(-m.quantity) FILTER (WHERE m.type = 'SALE_CONSUMPTION'), 0)::float8 AS consumed,
             COALESCE(SUM(-m.quantity) FILTER (WHERE m.type = 'SALE_CONSUMPTION' AND m.is_estimated), 0)::float8 AS "consumedEstimated",
             COALESCE(SUM(-m.quantity) FILTER (WHERE m.type = 'MANUAL_OUT'), 0)::float8 AS "manualOut",
             COALESCE(SUM(-m.quantity) FILTER (WHERE m.type = 'LOSS'), 0)::float8 AS lost,
             COALESCE(SUM(m.quantity) FILTER (WHERE m.type = 'ADJUSTMENT'), 0)::float8 AS adjusted,
             COUNT(*) FILTER (WHERE m.type = 'ADJUSTMENT')::int AS adjustments
      FROM stock_movements m
      JOIN ingredients i ON i.id = m.ingredient_id
      WHERE m.tenant_id = ${tenantId}::uuid
        AND m.reversed_at IS NULL
        AND m.reverses_id IS NULL
        AND m.occurred_at >= (CAST(${from} AS timestamptz) AT TIME ZONE 'UTC')
        AND m.occurred_at <= (CAST(${to} AS timestamptz) AT TIME ZONE 'UTC')
      GROUP BY i.id, i.name, i.base_unit, i.cost_per_unit
      ORDER BY i.name`;
  }

  /** Baixas de uma venda que ainda valem (nem estornadas, nem estornos). */
  findActiveBySale(tx: Tx, saleId: string) {
    return tx.stockMovement.findMany({
      where: { saleId, reversedAt: null, reversesId: null },
    });
  }

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
