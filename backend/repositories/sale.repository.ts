import type { Prisma } from '@prisma/client';
import type { Tx } from '@/config/database';
import type { Period } from '@/utils/date';

const ingredientRef = { select: { id: true, name: true, baseUnit: true } } as const;

const saleInclude = {
  items: {
    include: {
      product: { select: { id: true, name: true, pricingMode: true } },
      ingredients: { include: { ingredient: ingredientRef } },
    },
  },
} satisfies Prisma.SaleInclude;

export interface TopProductRow {
  productId: string;
  name: string;
  quantity: number;
  /** Dinheiro: Decimal (vai como string no JSON, sem perder precisão). */
  revenue: Prisma.Decimal;
  orders: number;
  weightG: number | null;
}

export class SaleRepository {
  // ---------- Escrita ----------

  create(tx: Tx, data: Prisma.SaleUncheckedCreateInput) {
    return tx.sale.create({ data });
  }

  createItem(tx: Tx, data: Prisma.SaleItemUncheckedCreateInput) {
    return tx.saleItem.create({ data });
  }

  createItemIngredients(tx: Tx, data: Prisma.SaleItemIngredientCreateManyInput[]) {
    return tx.saleItemIngredient.createMany({ data });
  }

  /**
   * Marca a venda como cancelada (nunca apagamos vendas). Só cancela se ainda estiver concluída:
   * devolve false se outra requisição cancelou antes.
   */
  async cancel(
    tx: Tx,
    id: string,
    data: { canceledById: string; cancelReason: string },
  ): Promise<boolean> {
    const { count } = await tx.sale.updateMany({
      where: { id, status: 'COMPLETED' },
      data: { status: 'CANCELED', canceledAt: new Date(), ...data },
    });
    return count === 1;
  }

  // ---------- Leitura ----------

  findById(tx: Tx, tenantId: string, id: string) {
    return tx.sale.findFirst({ where: { id, tenantId } });
  }

  findFull(tx: Tx, id: string) {
    return tx.sale.findUniqueOrThrow({ where: { id }, include: saleInclude });
  }

  /** Venda com itens, ingredientes e as baixas de estoque que ela gerou. */
  findDetail(tx: Tx, tenantId: string, id: string) {
    return tx.sale.findFirst({
      where: { id, tenantId },
      include: { ...saleInclude, movements: { include: { ingredient: ingredientRef } } },
    });
  }

  list(tx: Tx, where: Prisma.SaleWhereInput, take: number, skip: number) {
    return tx.sale.findMany({
      where,
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
      orderBy: [{ soldAt: 'desc' }, { createdAt: 'desc' }],
      take,
      skip,
    });
  }

  count(tx: Tx, where: Prisma.SaleWhereInput) {
    return tx.sale.count({ where });
  }

  // ---------- Relatórios ----------

  totals(tx: Tx, where: Prisma.SaleWhereInput) {
    return tx.sale.aggregate({ where, _sum: { totalAmount: true }, _count: true });
  }

  byChannel(tx: Tx, where: Prisma.SaleWhereInput) {
    return tx.sale.groupBy({ by: ['channel'], where, _sum: { totalAmount: true }, _count: true });
  }

  byPayment(tx: Tx, where: Prisma.SaleWhereInput) {
    return tx.sale.groupBy({
      by: ['paymentMethod'],
      where,
      _sum: { totalAmount: true },
      _count: true,
    });
  }

  /**
   * Custo estimado das vendas do período (CMV): baixas de estoque das vendas concluídas
   * × custo atual de cada ingrediente. Baixa de ingrediente sem custo cadastrado fica de fora
   * e é contada em `withoutCost` (para avisar que o valor está incompleto).
   */
  async estimatedCost(tx: Tx, tenantId: string, period: Period) {
    const [row] = await tx.$queryRaw<{ cost: Prisma.Decimal; withoutCost: number }[]>`
      SELECT COALESCE(SUM(-m.quantity * i.cost_per_unit), 0)::numeric(14, 2) AS cost,
             COUNT(*) FILTER (WHERE i.cost_per_unit IS NULL)::int AS "withoutCost"
      FROM stock_movements m
      JOIN sales s ON s.id = m.sale_id
      JOIN ingredients i ON i.id = m.ingredient_id
      WHERE m.tenant_id = ${tenantId}::uuid
        AND m.type = 'SALE_CONSUMPTION'
        AND m.reversed_at IS NULL
        AND m.reverses_id IS NULL
        AND s.status = 'COMPLETED'
        AND s.sold_at >= (CAST(${period.from} AS timestamptz) AT TIME ZONE 'UTC')
        AND s.sold_at <= (CAST(${period.to} AS timestamptz) AT TIME ZONE 'UTC')`;
    return { cost: row.cost, withoutCost: row.withoutCost };
  }

  /** Vendas de um dia para o fechamento de caixa (concluídas e canceladas). */
  listForCash(tx: Tx, where: Prisma.SaleWhereInput) {
    return tx.sale.findMany({
      where,
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
      orderBy: [{ soldAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  /** Pedidos e faturamento por dia, no fuso do estabelecimento. */
  dailyTotals(tx: Tx, tenantId: string, timezone: string, period: Period) {
    return tx.$queryRaw<{ day: string; orders: number; revenue: Prisma.Decimal }[]>`
      SELECT to_char(((s.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS orders,
             COALESCE(SUM(s.total_amount), 0)::numeric(14, 2) AS revenue
      FROM sales s
      WHERE s.tenant_id = ${tenantId}::uuid
        AND s.status = 'COMPLETED'
        AND s.sold_at >= (CAST(${period.from} AS timestamptz) AT TIME ZONE 'UTC')
        AND s.sold_at <= (CAST(${period.to} AS timestamptz) AT TIME ZONE 'UTC')
      GROUP BY 1
      ORDER BY 1`;
  }

  topProducts(tx: Tx, tenantId: string, period: Period, limit: number) {
    return tx.$queryRaw<TopProductRow[]>`
      SELECT p.id AS "productId", p.name,
             SUM(si.quantity)::float8 AS quantity,
             SUM(si.quantity * si.unit_price)::numeric(14, 2) AS revenue,
             COUNT(DISTINCT si.sale_id)::int AS orders,
             SUM(si.weight_g)::float8 AS "weightG"
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.tenant_id = ${tenantId}::uuid
        AND s.status = 'COMPLETED'
        AND s.sold_at >=(CAST(${period.from} AS timestamptz) AT TIME ZONE 'UTC')
        AND s.sold_at <= (CAST(${period.to} AS timestamptz) AT TIME ZONE 'UTC')
      GROUP BY p.id, p.name
      ORDER BY quantity DESC, revenue DESC
      LIMIT ${limit}`;
  }
}

export const saleRepository = new SaleRepository();
