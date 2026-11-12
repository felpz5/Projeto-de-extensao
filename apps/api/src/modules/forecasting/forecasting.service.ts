import { Injectable } from '@nestjs/common';
import { AuthContext } from '../../common/auth-context';
import { addDays, todayIn } from '../../common/schemas';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { stockLevels, ZERO } from '../inventory/stock-levels';
import {
  buildDailySeries,
  forecastDemand,
  recommendReorder,
  ReorderUrgency,
} from './forecast.engine';

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

interface DailyRow {
  id: string;
  day: string;
  value: number;
}

@Injectable()
export class ForecastingService {
  constructor(private readonly db: PrismaService) {}

  products(auth: AuthContext, horizonDays: number) {
    return this.db.withContext(auth, (tx) => this.computeProducts(tx, auth.tenantId, horizonDays));
  }

  reorder(auth: AuthContext, coverageDays: number) {
    return this.db.withContext(auth, (tx) => this.computeReorder(tx, auth.tenantId, coverageDays));
  }

  async computeProducts(tx: Tx, tenantId: string, horizonDays: number) {
    const { timezone, yesterday, start } = await this.window(tx, tenantId);

    const rows = await tx.$queryRaw<DailyRow[]>`
      SELECT si.product_id AS id,
             to_char(((s.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day,
             SUM(si.quantity)::float8 AS value
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.tenant_id = ${tenantId}::uuid
        AND ((s.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date BETWEEN ${start}::date AND ${yesterday}::date
      GROUP BY 1, 2`;

    const products = await tx.product.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, pricingMode: true },
    });
    const byProduct = groupRows(rows);

    const items = products.map((p) => {
      const values = byProduct.get(p.id) ?? new Map<string, number>();
      const first = [...values.keys()].sort()[0];
      const series = first ? buildDailySeries(values, first, yesterday) : [];
      return { product: p, forecast: forecastDemand(series, horizonDays) };
    });

    items.sort((a, b) => (b.forecast.total?.expected ?? -1) - (a.forecast.total?.expected ?? -1));
    return { horizonDays, generatedFor: addDays(yesterday, 1), disclaimer: FORECAST_DISCLAIMER, items };
  }

  async computeReorder(tx: Tx, tenantId: string, coverageDays: number) {
    const { timezone, yesterday, start } = await this.window(tx, tenantId);

    // Consumo = saídas (vendas, saídas manuais, perdas e ajustes negativos de inventário).
    const consumption = await tx.$queryRaw<(DailyRow & { estimated: boolean })[]>`
      SELECT m.ingredient_id AS id,
             to_char(((m.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day,
             SUM(-m.quantity)::float8 AS value,
             bool_or(m.is_estimated) AS estimated
      FROM stock_movements m
      WHERE m.tenant_id = ${tenantId}::uuid
        AND m.quantity < 0
        AND m.type::text IN ('SALE_CONSUMPTION', 'MANUAL_OUT', 'LOSS', 'ADJUSTMENT')
        AND ((m.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date BETWEEN ${start}::date AND ${yesterday}::date
      GROUP BY 1, 2`;

    // Início do histórico de cada ingrediente = primeira movimentação de qualquer tipo.
    const firsts = await tx.$queryRaw<{ id: string; day: string }[]>`
      SELECT m.ingredient_id AS id,
             to_char(MIN(((m.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date), 'YYYY-MM-DD') AS day
      FROM stock_movements m
      WHERE m.tenant_id = ${tenantId}::uuid
      GROUP BY 1`;

    const ingredients = await tx.ingredient.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, baseUnit: true, minStock: true, leadTimeDays: true, costPerUnit: true },
    });
    const levels = await stockLevels(tx, tenantId);
    const byIngredient = groupRows(consumption);
    const estimated = new Set(consumption.filter((r) => r.estimated).map((r) => r.id));
    const firstDay = new Map(firsts.map((f) => [f.id, f.day < start ? start : f.day]));

    const items = ingredients.map((ing) => {
      const stock = (levels.get(ing.id) ?? ZERO).toNumber();
      const first = firstDay.get(ing.id);
      const series =
        first && first <= yesterday
          ? buildDailySeries(byIngredient.get(ing.id) ?? new Map(), first, yesterday)
          : [];
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
        ingredient: { id: ing.id, name: ing.name, baseUnit: ing.baseUnit, leadTimeDays: ing.leadTimeDays },
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
        URGENCY_ORDER.indexOf(a.recommendation.urgency) - URGENCY_ORDER.indexOf(b.recommendation.urgency) ||
        (b.recommendation.suggestedQuantity ?? 0) - (a.recommendation.suggestedQuantity ?? 0),
    );

    return { coverageDays, generatedFor: addDays(yesterday, 1), disclaimer: FORECAST_DISCLAIMER, items };
  }

  /** Janela de análise: até ONTEM (o dia de hoje ainda está incompleto). */
  private async window(tx: Tx, tenantId: string) {
    const { timezone } = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const yesterday = addDays(todayIn(timezone), -1);
    return { timezone, yesterday, start: addDays(yesterday, -(LOOKBACK_DAYS - 1)) };
  }
}

function groupRows(rows: DailyRow[]) {
  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!map.has(r.id)) map.set(r.id, new Map());
    map.get(r.id)!.set(r.day, r.value);
  }
  return map;
}
