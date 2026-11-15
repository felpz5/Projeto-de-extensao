import { Prisma, type Sale } from '@prisma/client';
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
import { userRepository, type UserRepository } from '@/repositories/user.repository';
import { auditService, type AuditService } from '@/services/audit.service';
import { mergeConsumption, planSaleItem } from '@/services/sale-consumption';
import type { AuthContext } from '@/types/auth.types';
import type {
  CashQuery,
  CreateSaleDTO,
  IngredientInfo,
  ListSalesQuery,
  PeriodQuery,
  ProductInfo,
} from '@/types/sale.types';
import { AppError } from '@/utils/app-error';
import {
  parseDateFilter,
  resolvePeriod,
  startOfDayIn,
  todayIn,
  addDays,
  type Period,
} from '@/utils/date';
import { STAFF_SALE_EDIT_MINUTES } from '@/validations/sale.validation';

const ZERO = new Prisma.Decimal(0);

export class SaleService {
  constructor(
    private readonly sales: SaleRepository,
    private readonly products: ProductRepository,
    private readonly ingredients: IngredientRepository,
    private readonly movements: StockMovementRepository,
    private readonly tenants: TenantRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditService,
  ) {}

  /** Registra a venda e gera as baixas de estoque (exatas ou estimadas). */
  create(auth: AuthContext, input: CreateSaleDTO) {
    return withContext(auth, (tx) => this.createInTx(tx, auth, input));
  }

  // ---------- Cancelar e corrigir (venda nunca é apagada) ----------

  /**
   * Cancela a venda: ela continua no histórico (com motivo, quem e quando), sai dos relatórios
   * e as baixas de estoque são estornadas.
   * Funcionário: só a própria venda e só nos primeiros minutos (erro de digitação no balcão).
   */
  cancel(auth: AuthContext, id: string, reason: string) {
    return withContext(auth, async (tx) => {
      const sale = await this.findEditable(tx, auth, id);
      await this.cancelInTx(tx, auth, sale, reason);
      await this.audit.log(tx, auth, 'sale.cancel', 'sale', id, {
        reason,
        totalAmount: sale.totalAmount.toString(),
        soldAt: sale.soldAt.toISOString(),
      });
      return this.sales.findFull(tx, id);
    });
  }

  /**
   * Corrige uma venda digitada errado: cancela a original e registra a versão certa, ligada a
   * ela (correctsId) e, por padrão, com a mesma data e hora. Tudo numa transação só.
   */
  correct(auth: AuthContext, id: string, input: CreateSaleDTO) {
    return withContext(auth, async (tx) => {
      const original = await this.findEditable(tx, auth, id);
      await this.cancelInTx(tx, auth, original, 'Corrigida (substituída por outra venda)');
      const corrected = await this.createInTx(
        tx,
        auth,
        {
          ...input,
          soldAt: input.soldAt ?? original.soldAt,
        },
        original.id,
      );
      await this.audit.log(tx, auth, 'sale.correct', 'sale', id, {
        correctedBy: corrected.id,
        before: original.totalAmount.toString(),
        after: corrected.totalAmount.toString(),
      });
      return corrected;
    });
  }

  // ---------- Leitura ----------

  list(auth: AuthContext, q: ListSalesQuery) {
    return withContext(auth, async (tx) => {
      const tz = await this.tenants.findTimezone(tx, auth.tenantId);
      const from = parseDateFilter(q.from, tz, 'start');
      const to = parseDateFilter(q.to, tz, 'end');
      const where: Prisma.SaleWhereInput = {
        tenantId: auth.tenantId,
        channel: q.channel,
        status: q.status,
        paymentMethod: q.paymentMethod,
        soldAt: from || to ? { gte: from, lte: to } : undefined,
        items: q.productId ? { some: { productId: q.productId } } : undefined,
      };
      const [items, total, sum] = await Promise.all([
        this.sales.list(tx, where, q.take, q.skip),
        this.sales.count(tx, where),
        // O total em dinheiro só soma vendas concluídas (cancelada não é faturamento).
        this.sales.totals(tx, { ...where, status: q.status ?? 'COMPLETED' }),
      ]);
      return {
        items: await this.withNames(items),
        total,
        totalAmount: sum._sum.totalAmount ?? 0,
        take: q.take,
        skip: q.skip,
      };
    });
  }

  /** Detalhe. Funcionário só enxerga as próprias vendas (as outras "não existem" para ele). */
  getById(auth: AuthContext, id: string) {
    return withContext(auth, async (tx) => {
      const sale = await this.sales.findDetail(tx, auth.tenantId, id);
      if (!sale || (auth.role === 'STAFF' && sale.createdById !== auth.userId)) {
        throw new AppError('Venda não encontrada', 404);
      }
      const [named] = await this.withNames([sale]);
      return { ...named, editableUntil: this.editableUntil(auth, sale) };
    });
  }

  /**
   * Fechamento de caixa de um dia: total por forma de pagamento, canceladas e a lista de vendas.
   * Funcionário vê só o próprio caixa; dono/gerente veem o da loja toda ou o de uma pessoa.
   */
  cash(auth: AuthContext, q: CashQuery) {
    return withContext(auth, async (tx) => {
      const tz = await this.tenants.findTimezone(tx, auth.tenantId);
      const date = q.date ?? todayIn(tz);
      const userId = auth.role === 'STAFF' ? auth.userId : q.userId;
      const where: Prisma.SaleWhereInput = {
        tenantId: auth.tenantId,
        createdById: userId,
        soldAt: { gte: startOfDayIn(date, tz), lt: startOfDayIn(addDays(date, 1), tz) },
      };
      const completed = { ...where, status: 'COMPLETED' as const };
      const canceled = { ...where, status: 'CANCELED' as const };

      const [totals, byPayment, canceledTotals, sales] = await Promise.all([
        this.sales.totals(tx, completed),
        this.sales.byPayment(tx, completed),
        this.sales.totals(tx, canceled),
        this.sales.listForCash(tx, where),
      ]);
      const revenue = totals._sum.totalAmount ?? ZERO;
      return {
        date,
        userId: userId ?? null,
        editWindowMinutes: STAFF_SALE_EDIT_MINUTES,
        orders: totals._count,
        revenue,
        averageTicket: totals._count ? revenue.div(totals._count).toDecimalPlaces(2) : ZERO,
        byPayment: byPayment
          .map((p) => ({
            method: p.paymentMethod,
            orders: p._count,
            revenue: p._sum.totalAmount ?? ZERO,
          }))
          .sort((a, b) => Number(b.revenue) - Number(a.revenue)),
        canceled: {
          orders: canceledTotals._count,
          amount: canceledTotals._sum.totalAmount ?? ZERO,
        },
        sales: (await this.withNames(sales)).map((s) => ({
          ...s,
          editableUntil: this.editableUntil(auth, s),
        })),
      };
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
    const where = {
      tenantId,
      status: 'COMPLETED' as const,
      soldAt: { gte: period.from, lte: period.to },
    };

    const [totals, byChannel, byPayment, byDay, cost] = await Promise.all([
      this.sales.totals(tx, where),
      this.sales.byChannel(tx, where),
      this.sales.byPayment(tx, where),
      this.sales.dailyTotals(tx, tenantId, timezone, period),
      this.sales.estimatedCost(tx, tenantId, period),
    ]);

    const revenue = totals._sum.totalAmount ?? ZERO;
    const orders = totals._count;
    return {
      period,
      revenue,
      orders,
      averageTicket: orders ? revenue.div(orders).toDecimalPlaces(2) : ZERO,
      /**
       * Custo dos ingredientes que as vendas baixaram × custo atual de cada um (estimativa:
       * vendas sem receita/composição não baixam ingredientes e não entram no custo).
       */
      estimatedCost: cost.cost,
      grossProfit: revenue.minus(cost.cost),
      costMissingMovements: cost.withoutCost,
      byChannel: byChannel.map((c) => ({
        channel: c.channel,
        orders: c._count,
        revenue: c._sum.totalAmount ?? 0,
      })),
      byPayment: byPayment.map((p) => ({
        method: p.paymentMethod,
        orders: p._count,
        revenue: p._sum.totalAmount ?? 0,
      })),
      byDay,
    };
  }

  computeTopProducts(tx: Tx, tenantId: string, period: Period, limit: number) {
    return this.sales.topProducts(tx, tenantId, period, limit);
  }

  // ---------- Auxiliares ----------

  private async createInTx(tx: Tx, auth: AuthContext, input: CreateSaleDTO, correctsId?: string) {
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

    const itemsTotal = planned.reduce((sum, p) => sum.plus(p.unitPrice.mul(p.quantity)), ZERO);
    const totalWeight =
      input.totalWeightG ??
      (planned.some((p) => p.weightG)
        ? planned.reduce((s, p) => s + (p.weightG?.toNumber() ?? 0), 0)
        : undefined);

    const sale = await this.sales.create(tx, {
      tenantId: auth.tenantId,
      channel: input.channel,
      paymentMethod: input.paymentMethod,
      soldAt: input.soldAt,
      totalAmount: input.totalAmount ?? itemsTotal.toDecimalPlaces(2),
      totalWeightG: totalWeight,
      notes: input.notes,
      createdById: auth.userId,
      correctsId,
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
      editableUntil: this.editableUntil(auth, full),
      stockImpact: {
        exactMovements: consumption.filter((c) => !c.isEstimated).length,
        estimatedMovements: consumption.filter((c) => c.isEstimated).length,
        unknownIngredients: planned
          .flatMap((p) => p.ingredients)
          .filter((i) => i.quantitySource === 'UNKNOWN').length,
      },
    };
  }

  /** Marca como cancelada e estorna cada baixa de estoque que a venda gerou. */
  private async cancelInTx(tx: Tx, auth: AuthContext, sale: Sale, reason: string) {
    if (
      !(await this.sales.cancel(tx, sale.id, { canceledById: auth.userId, cancelReason: reason }))
    ) {
      throw new AppError('Esta venda já foi cancelada', 409);
    }
    const movements = await this.movements.findActiveBySale(tx, sale.id);
    for (const m of movements) {
      if (!(await this.movements.markReversed(tx, m.id))) continue;
      await this.movements.create(tx, {
        tenantId: auth.tenantId,
        ingredientId: m.ingredientId,
        type: m.type,
        quantity: m.quantity.negated(),
        // mesma data da baixa: o saldo histórico fica como se a venda não tivesse acontecido
        occurredAt: m.occurredAt,
        saleId: sale.id,
        isEstimated: m.isEstimated,
        reversesId: m.id,
        note: 'Estorno: venda cancelada',
        createdById: auth.userId,
      });
    }
  }

  /** Venda que esta pessoa pode cancelar/corrigir agora (ou erro explicando por que não). */
  private async findEditable(tx: Tx, auth: AuthContext, id: string) {
    const sale = await this.sales.findById(tx, auth.tenantId, id);
    if (!sale || (auth.role === 'STAFF' && sale.createdById !== auth.userId)) {
      throw new AppError('Venda não encontrada', 404);
    }
    if (sale.status === 'CANCELED') throw new AppError('Esta venda já foi cancelada', 409);
    if (auth.role === 'STAFF' && !this.editableUntil(auth, sale)) {
      throw new AppError(
        `O prazo de ${STAFF_SALE_EDIT_MINUTES} minutos para corrigir esta venda acabou. Peça ao gerente.`,
        403,
      );
    }
    return sale;
  }

  /**
   * Até quando esta pessoa pode cancelar/corrigir a venda. Dono/gerente: sem prazo (null =
   * sem limite, quando a venda está concluída). Funcionário: própria venda, até X minutos.
   * Devolve false quando não pode.
   */
  private editableUntil(
    auth: AuthContext,
    sale: Pick<Sale, 'status' | 'createdById' | 'createdAt'>,
  ): string | null | false {
    if (sale.status !== 'COMPLETED') return false;
    if (auth.role !== 'STAFF') return null;
    if (sale.createdById !== auth.userId) return false;
    const until = sale.createdAt.getTime() + STAFF_SALE_EDIT_MINUTES * 60_000;
    return until > Date.now() ? new Date(until).toISOString() : false;
  }

  /** Acrescenta o nome de quem registrou e de quem cancelou. */
  private async withNames<T extends Pick<Sale, 'createdById' | 'canceledById'>>(sales: T[]) {
    const names = await this.users.namesById(sales.flatMap((s) => [s.createdById, s.canceledById]));
    return sales.map((s) => ({
      ...s,
      createdByName: s.createdById ? (names.get(s.createdById) ?? null) : null,
      canceledByName: s.canceledById ? (names.get(s.canceledById) ?? null) : null,
    }));
  }

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
  userRepository,
  auditService,
);
