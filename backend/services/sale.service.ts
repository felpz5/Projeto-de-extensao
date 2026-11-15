import { Prisma } from '@prisma/client';
import { withContext, type Tx } from '@/config/database';
import {
  ingredientRepository,
  type IngredientRepository,
} from '@/repositories/ingredient.repository';
import { productRepository, type ProductRepository } from '@/repositories/product.repository';
import { saleRepository, type SaleRepository } from '@/repositories/sale.repository';
import {
  stockMovementRepository,
  type StockMovementRepository,
} from '@/repositories/stock-movement.repository';
import { tenantRepository, type TenantRepository } from '@/repositories/tenant.repository';
import { auditService, type AuditService } from '@/services/audit.service';
import { mergeConsumption, planSaleItem } from '@/services/sale-consumption';
import type { AuthContext } from '@/types/auth.types';
import type {
  CreateSaleDTO,
  IngredientInfo,
  ListSalesQuery,
  PeriodQuery,
  ProductInfo,
} from '@/types/sale.types';
import { AppError } from '@/utils/app-error';
import { parseDateFilter, resolvePeriod, type Period } from '@/utils/date';

export class SaleService {
  constructor(
    private readonly sales: SaleRepository,
    private readonly products: ProductRepository,
    private readonly ingredients: IngredientRepository,
    private readonly movements: StockMovementRepository,
    private readonly tenants: TenantRepository,
    private readonly audit: AuditService,
  ) {}

  /** Registra a venda e gera as baixas de estoque (exatas ou estimadas). */
  create(auth: AuthContext, input: CreateSaleDTO) {
    return withContext(auth, async (tx) => {
      const products = await this.loadProducts(
        tx,
        auth.tenantId,
        input.items.map((i) => i.productId),
      );
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
                    ? new Prisma.Decimal(input.totalAmount)
                        .div(input.items[0].quantity)
                        .toDecimalPlaces(2)
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

      const sale = await this.sales.create(tx, {
        tenantId: auth.tenantId,
        channel: input.channel,
        soldAt: input.soldAt,
        totalAmount: input.totalAmount ?? itemsTotal.toDecimalPlaces(2),
        totalWeightG: totalWeight,
        notes: input.notes,
        createdById: auth.userId,
      });

      for (const p of planned) {
        const item = await this.sales.createItem(tx, {
          tenantId: auth.tenantId,
          saleId: sale.id,
          productId: p.productId,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          weightG: p.weightG,
        });
        if (p.ingredients.length) {
          await this.sales.createItemIngredients(
            tx,
            p.ingredients.map((i) => ({ ...i, tenantId: auth.tenantId, saleItemId: item.id })),
          );
        }
      }

      const consumption = mergeConsumption(planned);
      if (consumption.length) {
        await this.movements.createMany(
          tx,
          consumption.map((c) => ({
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
        );
      }

      const full = await this.sales.findFull(tx, sale.id);
      return {
        ...full,
        stockImpact: {
          exactMovements: consumption.filter((c) => !c.isEstimated).length,
          estimatedMovements: consumption.filter((c) => c.isEstimated).length,
          unknownIngredients: planned
            .flatMap((p) => p.ingredients)
            .filter((i) => i.quantitySource === 'UNKNOWN').length,
        },
      };
    });
  }

  list(auth: AuthContext, q: ListSalesQuery) {
    return withContext(auth, async (tx) => {
      const tz = await this.tenants.findTimezone(tx, auth.tenantId);
      const from = parseDateFilter(q.from, tz, 'start');
      const to = parseDateFilter(q.to, tz, 'end');
      const where: Prisma.SaleWhereInput = {
        tenantId: auth.tenantId,
        channel: q.channel,
        soldAt: from || to ? { gte: from, lte: to } : undefined,
        items: q.productId ? { some: { productId: q.productId } } : undefined,
      };
      const [items, total, sum] = await Promise.all([
        this.sales.list(tx, where, q.take, q.skip),
        this.sales.count(tx, where),
        this.sales.totals(tx, where),
      ]);
      return { items, total, totalAmount: sum._sum.totalAmount ?? 0, take: q.take, skip: q.skip };
    });
  }

  getById(auth: AuthContext, id: string) {
    return withContext(auth, async (tx) => {
      const sale = await this.sales.findDetail(tx, auth.tenantId, id);
      if (!sale) throw new AppError('Venda não encontrada', 404);
      return sale;
    });
  }

  /** Exclui a venda e desfaz as baixas de estoque que ela gerou. */
  remove(auth: AuthContext, id: string) {
    return withContext(auth, async (tx) => {
      const sale = await this.sales.findById(tx, auth.tenantId, id);
      if (!sale) throw new AppError('Venda não encontrada', 404);
      await this.sales.delete(tx, id);
      await this.audit.log(tx, auth, 'sale.delete', 'sale', id, {
        channel: sale.channel,
        totalAmount: sale.totalAmount.toString(),
        soldAt: sale.soldAt.toISOString(),
      });
    });
  }

  summary(auth: AuthContext, q: PeriodQuery) {
    return withContext(auth, async (tx) =>
      this.computeSummary(tx, auth.tenantId, await this.period(tx, auth.tenantId, q)),
    );
  }

  topProducts(auth: AuthContext, q: PeriodQuery, limit = 10) {
    return withContext(auth, async (tx) =>
      this.computeTopProducts(tx, auth.tenantId, await this.period(tx, auth.tenantId, q), limit),
    );
  }

  // ---------- Relatórios (reaproveitados pelo dashboard) ----------

  /** Período pedido, interpretado no fuso do estabelecimento. */
  async period(tx: Tx, tenantId: string, q: PeriodQuery): Promise<Period> {
    return resolvePeriod(q, await this.tenants.findTimezone(tx, tenantId));
  }

  async computeSummary(tx: Tx, tenantId: string, period: Period) {
    const timezone = await this.tenants.findTimezone(tx, tenantId);
    const where = { tenantId, soldAt: { gte: period.from, lte: period.to } };

    const [totals, byChannel, byDay] = await Promise.all([
      this.sales.totals(tx, where),
      this.sales.byChannel(tx, where),
      this.sales.dailyTotals(tx, tenantId, timezone, period),
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
    return this.sales.topProducts(tx, tenantId, period, limit);
  }

  // ---------- Auxiliares ----------

  private async loadProducts(tx: Tx, tenantId: string, ids: string[]) {
    const found = await this.products.findManyForSale(tx, tenantId, [...new Set(ids)]);
    const map = new Map<string, ProductInfo>();
    for (const p of found) {
      if (!p.active) throw new AppError(`O produto "${p.name}" está inativo`, 400);
      map.set(p.id, {
        id: p.id,
        name: p.name,
        pricingMode: p.pricingMode,
        price: p.price,
        recipe: p.recipeItems,
        weightMix: p.weightMix,
      });
    }
    if (map.size !== new Set(ids).size) throw new AppError('Um ou mais produtos não existem', 400);
    return map;
  }

  private async loadIngredients(tx: Tx, tenantId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map<string, IngredientInfo>();
    const found = await this.ingredients.findPortions(tx, tenantId, unique);
    if (found.length !== unique.length) {
      throw new AppError('Um ou mais ingredientes não existem', 400);
    }
    const inactive = found.filter((i) => !i.active);
    if (inactive.length) {
      throw new AppError(`Ingrediente inativo: ${inactive.map((i) => i.name).join(', ')}`, 400);
    }
    return new Map(found.map((i) => [i.id, { id: i.id, defaultPortion: i.defaultPortion }]));
  }
}

export const saleService = new SaleService(
  saleRepository,
  productRepository,
  ingredientRepository,
  stockMovementRepository,
  tenantRepository,
  auditService,
);
