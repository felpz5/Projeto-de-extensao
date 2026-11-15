import { withContext, type Tx } from '@/config/database';
import { forecastRepository, type ForecastRepository } from '@/repositories/forecast.repository';
import {
  ingredientRepository,
  type IngredientRepository,
} from '@/repositories/ingredient.repository';
import { productRepository, type ProductRepository } from '@/repositories/product.repository';
import {
  stockMovementRepository,
  type StockMovementRepository,
} from '@/repositories/stock-movement.repository';
import { tenantRepository, type TenantRepository } from '@/repositories/tenant.repository';
import {
  buildDailySeries,
  correctConsumption,
  forecastDemand,
  recommendReorder,
} from '@/services/forecast-engine';
import type { AuthContext } from '@/types/auth.types';
import type { DailyRow, ReorderUrgency } from '@/types/forecast.types';
import { addDays, todayIn } from '@/utils/date';
import { ZERO } from '@/utils/decimal';

/** Quantos dias de histórico entram no cálculo. */
const LOOKBACK_DAYS = 120;

export const FORECAST_DISCLAIMER =
  'Previsões são estimativas calculadas a partir do histórico registrado e não representam valores exatos.';

const URGENCY_ORDER: ReorderUrgency[] = [
  'OUT_OF_STOCK',
  'URGENT',
  'LOW_STOCK_NO_HISTORY',
  'BUY',
  'OK',
  'NO_HISTORY',
];

function groupRows(rows: DailyRow[]) {
  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!map.has(r.id)) map.set(r.id, new Map());
    map.get(r.id)!.set(r.day, r.value);
  }
  return map;
}

export class ForecastService {
  constructor(
    private readonly forecasts: ForecastRepository,
    private readonly products: ProductRepository,
    private readonly ingredients: IngredientRepository,
    private readonly movements: StockMovementRepository,
    private readonly tenants: TenantRepository,
  ) {}

  productDemand(auth: AuthContext, horizonDays: number) {
    return withContext(auth, (tx) => this.computeProducts(tx, auth.tenantId, horizonDays));
  }

  reorder(auth: AuthContext, coverageDays: number) {
    return withContext(auth, (tx) => this.computeReorder(tx, auth.tenantId, coverageDays));
  }

  /** Demanda prevista por produto ativo. */
  async computeProducts(tx: Tx, tenantId: string, horizonDays: number) {
    const { timezone, yesterday, start } = await this.window(tx, tenantId);

    const rows = await this.forecasts.productDailyDemand(tx, tenantId, timezone, start, yesterday);
    const products = await this.products.list(tx, tenantId, { active: true });
    const byProduct = groupRows(rows);

    const items = products.map((p) => {
      const values = byProduct.get(p.id) ?? new Map<string, number>();
      const first = [...values.keys()].sort()[0];
      const series = first ? buildDailySeries(values, first, yesterday) : [];
      return {
        product: { id: p.id, name: p.name, pricingMode: p.pricingMode },
        forecast: forecastDemand(series, horizonDays),
      };
    });

    items.sort((a, b) => (b.forecast.total?.expected ?? -1) - (a.forecast.total?.expected ?? -1));
    return {
      horizonDays,
      generatedFor: addDays(yesterday, 1),
      disclaimer: FORECAST_DISCLAIMER,
      items,
    };
  }

  /** Sugestão de compra por ingrediente para cobrir prazo de entrega + `coverageDays`. */
  async computeReorder(tx: Tx, tenantId: string, coverageDays: number) {
    const { timezone, yesterday, start } = await this.window(tx, tenantId);

    const consumption = await this.forecasts.ingredientDailyConsumption(
      tx,
      tenantId,
      timezone,
      start,
      yesterday,
    );
    const firsts = await this.forecasts.ingredientFirstMovementDays(tx, tenantId, timezone);
    const ingredients = await this.ingredients.listForReorder(tx, tenantId);
    const balances = await this.movements.balances(tx, tenantId);

    const estimated = new Set(consumption.filter((r) => r.estimated).map((r) => r.id));
    const realFirstDay = new Map(firsts.map((f) => [f.id, f.day]));

    // Saídas e ajustes por ingrediente. Ajustes do PRIMEIRO dia do ingrediente são a carga
    // inicial (ex.: primeira contagem), não correção de consumo — ficam de fora.
    const outflows = groupRows(
      consumption.map((r) => ({ id: r.id, day: r.day, value: r.outflow })),
    );
    const adjustments = groupRows(
      consumption
        .filter((r) => r.adjustment !== 0 && r.day !== realFirstDay.get(r.id))
        .map((r) => ({ id: r.id, day: r.day, value: r.adjustment })),
    );

    const items = ingredients.map((ing) => {
      const stock = (balances.get(ing.id) ?? ZERO).toNumber();
      const realFirst = realFirstDay.get(ing.id);
      const first = realFirst && realFirst < start ? start : realFirst;
      const daily = correctConsumption(
        outflows.get(ing.id) ?? new Map(),
        adjustments.get(ing.id) ?? new Map(),
      );
      const series = first && first <= yesterday ? buildDailySeries(daily, first, yesterday) : [];
      const forecast = forecastDemand(series, ing.leadTimeDays + coverageDays);
      const recommendation = recommendReorder({
        stock,
        minStock: ing.minStock.toNumber(),
        leadTimeDays: ing.leadTimeDays,
        coverageDays,
        forecast,
      });
      const cost = ing.costPerUnit?.toNumber();
      return {
        ingredient: {
          id: ing.id,
          name: ing.name,
          baseUnit: ing.baseUnit,
          leadTimeDays: ing.leadTimeDays,
        },
        stock,
        minStock: ing.minStock.toNumber(),
        usesEstimatedData: estimated.has(ing.id),
        forecast: {
          status: forecast.status,
          confidence: forecast.confidence,
          historyDays: forecast.historyDays,
          averageDaily: forecast.averageDaily,
          total: forecast.total,
          message: forecast.message,
        },
        recommendation: {
          ...recommendation,
          estimatedCost:
            cost !== undefined && recommendation.suggestedQuantity
              ? Math.round(cost * recommendation.suggestedQuantity * 100) / 100
              : null,
        },
      };
    });

    items.sort(
      (a, b) =>
        URGENCY_ORDER.indexOf(a.recommendation.urgency) -
          URGENCY_ORDER.indexOf(b.recommendation.urgency) ||
        (b.recommendation.suggestedQuantity ?? 0) - (a.recommendation.suggestedQuantity ?? 0),
    );

    return {
      coverageDays,
      generatedFor: addDays(yesterday, 1),
      disclaimer: FORECAST_DISCLAIMER,
      items,
    };
  }

  /** Janela de análise: até ONTEM (o dia de hoje ainda está incompleto). */
  private async window(tx: Tx, tenantId: string) {
    const timezone = await this.tenants.findTimezone(tx, tenantId);
    const yesterday = addDays(todayIn(timezone), -1);
    return { timezone, yesterday, start: addDays(yesterday, -(LOOKBACK_DAYS - 1)) };
  }
}

export const forecastService = new ForecastService(
  forecastRepository,
  productRepository,
  ingredientRepository,
  stockMovementRepository,
  tenantRepository,
);
