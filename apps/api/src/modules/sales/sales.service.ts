import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { AuthContext } from '../../common/auth-context';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { IngredientInfo, mergeConsumption, planSaleItem, ProductInfo } from './consumption';
import { CreateSaleInput, ListSalesQuery, PeriodQuery } from './sales.schemas';

const DAY_MS = 24 * 60 * 60_000;

export interface Period {
  from: Date;
  to: Date;
}

/** Período padrão: últimos 30 dias. */
export function resolvePeriod(q: PeriodQuery, defaultDays = 30): Period {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - defaultDays * DAY_MS);
  if (from > to) throw new BadRequestException('A data inicial deve ser anterior à final');
  return { from, to };
}

const saleInclude = {
  items: {
    include: {
      product: { select: { id: true, name: true, pricingMode: true } },
      ingredients: {
        include: { ingredient: { select: { id: true, name: true, baseUnit: true } } },
      },
    },
  },
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(auth: AuthContext, input: CreateSaleInput) {
    return this.db.withContext(auth, async (tx) => {
      const products = await this.loadProducts(tx, auth.tenantId, input.items.map((i) => i.productId));
      const ingredients = await this.loadIngredients(
        tx,
        auth.tenantId,
        input.items.flatMap((i) => i.ingredients?.map((s) => s.ingredientId) ?? []),
      );

      // Venda de balcão típica: um pote, com valor e peso informados só no total da venda.
      // Nesse caso o item herda o valor cobrado e o peso da balança.
      const items =
        input.items.length === 1
          ? [
              {
                ...input.items[0],
                weightG: input.items[0].weightG ?? input.totalWeightG,
                unitPrice:
                  input.items[0].unitPrice ??
                  (input.totalAmount !== undefined
                    ? input.totalAmount / input.items[0].quantity
                    : undefined),
              },
            ]
          : input.items;
      const planned = items.map((item) =>
        planSaleItem(item, products.get(item.productId)!, ingredients),
      );

      const itemsTotal = planned.reduce(
        (sum, p) => sum.plus(p.unitPrice.mul(p.quantity)),
        new Prisma.Decimal(0),
      );
      const totalWeight =
        input.totalWeightG ??
        (planned.some((p) => p.weightG)
          ? planned.reduce((s, p) => s + (p.weightG?.toNumber() ?? 0), 0)
          : undefined);

      const sale = await tx.sale.create({
        data: {
          tenantId: auth.tenantId,
          channel: input.channel,
          soldAt: input.soldAt,
          totalAmount: input.totalAmount ?? itemsTotal.toDecimalPlaces(2),
          totalWeightG: totalWeight,
          notes: input.notes,
          createdById: auth.userId,
        },
      });

      for (const p of planned) {
        const item = await tx.saleItem.create({
          data: {
            tenantId: auth.tenantId,
            saleId: sale.id,
            productId: p.productId,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            weightG: p.weightG,
          },
        });
        if (p.ingredients.length) {
          await tx.saleItemIngredient.createMany({
            data: p.ingredients.map((i) => ({ ...i, tenantId: auth.tenantId, saleItemId: item.id })),
          });
        }
      }

      const consumption = mergeConsumption(planned);
      if (consumption.length) {
        await tx.stockMovement.createMany({
          data: consumption.map((c) => ({
            tenantId: auth.tenantId,
            ingredientId: c.ingredientId,
            type: 'SALE_CONSUMPTION' as const,
            quantity: c.quantity.negated(),
            occurredAt: sale.soldAt,
            saleId: sale.id,
            isEstimated: c.isEstimated,
            note: c.isEstimated ? `Estimativa (${c.source})` : null,
            createdById: auth.userId,
          })),
        });
      }

      const full = await tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: saleInclude });
      return {
        ...full,
        stockImpact: {
          exactMovements: consumption.filter((c) => !c.isEstimated).length,
          estimatedMovements: consumption.filter((c) => c.isEstimated).length,
          unknownIngredients: planned.flatMap((p) => p.ingredients).filter((i) => i.quantitySource === 'UNKNOWN').length,
        },
      };
    });
  }

  list(auth: AuthContext, q: ListSalesQuery) {
    const where: Prisma.SaleWhereInput = {
      tenantId: auth.tenantId,
      channel: q.channel,
      soldAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
      items: q.productId ? { some: { productId: q.productId } } : undefined,
    };
    return this.db.withContext(auth, async (tx) => {
      const [items, total, sum] = await Promise.all([
        tx.sale.findMany({
          where,
          include: { items: { include: { product: { select: { id: true, name: true } } } } },
          orderBy: { soldAt: 'desc' },
          take: q.take,
          skip: q.skip,
        }),
        tx.sale.count({ where }),
        tx.sale.aggregate({ where, _sum: { totalAmount: true } }),
      ]);
      return { items, total, totalAmount: sum._sum.totalAmount ?? 0, take: q.take, skip: q.skip };
    });
  }

  get(auth: AuthContext, id: string) {
    return this.db.withContext(auth, async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, tenantId: auth.tenantId },
        include: {
          ...saleInclude,
          movements: { include: { ingredient: { select: { id: true, name: true, baseUnit: true } } } },
        },
      });
      if (!sale) throw new NotFoundException('Venda não encontrada');
      return sale;
    });
  }

  /** Exclui a venda e desfaz as baixas de estoque que ela gerou. */
  remove(auth: AuthContext, id: string) {
    return this.db.withContext(auth, async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id, tenantId: auth.tenantId } });
      if (!sale) throw new NotFoundException('Venda não encontrada');
      await tx.sale.delete({ where: { id } });
      await this.audit.log(tx, auth, 'sale.delete', 'sale', id, {
        channel: sale.channel,
        totalAmount: sale.totalAmount.toString(),
        soldAt: sale.soldAt.toISOString(),
      });
    });
  }

  summary(auth: AuthContext, q: PeriodQuery) {
    return this.db.withContext(auth, (tx) => this.computeSummary(tx, auth.tenantId, resolvePeriod(q)));
  }

  topProducts(auth: AuthContext, q: PeriodQuery, limit = 10) {
    return this.db.withContext(auth, (tx) =>
      this.computeTopProducts(tx, auth.tenantId, resolvePeriod(q), limit),
    );
  }

  // ---------- Relatórios (reaproveitados pelo dashboard) ----------

  async computeSummary(tx: Tx, tenantId: string, period: Period) {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } });
    const where = { tenantId, soldAt: { gte: period.from, lte: period.to } };

    const [totals, byChannel, byDay] = await Promise.all([
      tx.sale.aggregate({ where, _sum: { totalAmount: true }, _count: true }),
      tx.sale.groupBy({ by: ['channel'], where, _sum: { totalAmount: true }, _count: true }),
      tx.$queryRaw<{ day: string; orders: number; revenue: number }[]>`
        SELECT to_char(((s.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${tenant.timezone})::date, 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS orders,
               COALESCE(SUM(s.total_amount), 0)::float8 AS revenue
        FROM sales s
        WHERE s.tenant_id = ${tenantId}::uuid
          AND s.sold_at >= (CAST(${period.from} AS timestamptz) AT TIME ZONE 'UTC')
          AND s.sold_at <= (CAST(${period.to} AS timestamptz) AT TIME ZONE 'UTC')
        GROUP BY 1
        ORDER BY 1`,
    ]);

    const revenue = totals._sum.totalAmount ?? new Prisma.Decimal(0);
    const orders = totals._count;
    return {
      period,
      revenue,
      orders,
      averageTicket: orders ? revenue.div(orders).toDecimalPlaces(2) : new Prisma.Decimal(0),
      byChannel: byChannel.map((c) => ({
        channel: c.channel,
        orders: c._count,
        revenue: c._sum.totalAmount ?? 0,
      })),
      byDay,
    };
  }

  computeTopProducts(tx: Tx, tenantId: string, period: Period, limit: number) {
    return tx.$queryRaw<
      { productId: string; name: string; quantity: number; revenue: number; orders: number; weightG: number | null }[]
    >`
      SELECT p.id AS "productId", p.name,
             SUM(si.quantity)::float8 AS quantity,
             SUM(si.quantity * si.unit_price)::float8 AS revenue,
             COUNT(DISTINCT si.sale_id)::int AS orders,
             SUM(si.weight_g)::float8 AS "weightG"
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.tenant_id = ${tenantId}::uuid
        AND s.sold_at >= (CAST(${period.from} AS timestamptz) AT TIME ZONE 'UTC')
        AND s.sold_at <= (CAST(${period.to} AS timestamptz) AT TIME ZONE 'UTC')
      GROUP BY p.id, p.name
      ORDER BY quantity DESC, revenue DESC
      LIMIT ${limit}`;
  }

  // ---------- Auxiliares ----------

  private async loadProducts(tx: Tx, tenantId: string, ids: string[]) {
    const found = await tx.product.findMany({
      where: { tenantId, id: { in: [...new Set(ids)] } },
      include: { recipeItems: true, weightMix: true },
    });
    const map = new Map<string, ProductInfo>();
    for (const p of found) {
      if (!p.active) throw new BadRequestException(`O produto "${p.name}" está inativo`);
      map.set(p.id, {
        id: p.id,
        name: p.name,
        pricingMode: p.pricingMode,
        price: p.price,
        recipe: p.recipeItems,
        weightMix: p.weightMix,
      });
    }
    if (map.size !== new Set(ids).size) throw new BadRequestException('Um ou mais produtos não existem');
    return map;
  }

  private async loadIngredients(tx: Tx, tenantId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map<string, IngredientInfo>();
    const found = await tx.ingredient.findMany({
      where: { tenantId, id: { in: unique } },
      select: { id: true, defaultPortion: true },
    });
    if (found.length !== unique.length) throw new BadRequestException('Um ou mais ingredientes não existem');
    return new Map(found.map((i) => [i.id, i]));
  }
}
