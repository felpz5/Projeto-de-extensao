import type { BaseUnit, PricingMode } from '@prisma/client';
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
  round,
  stockoutDays,
} from '@/services/forecast-engine';
import {
  backtest,
  MODEL_LABEL,
  pooledMetrics,
  summarizeAccuracy,
  type AccuracySummary,
  type BacktestResult,
  type ModelId,
} from '@/services/forecast-evaluation';
import type { AuthContext } from '@/types/auth.types';
import type { DailyPoint, DailyRow, Forecast, ReorderUrgency } from '@/types/forecast.types';
import { AppError } from '@/utils/app-error';
import { addDays, todayIn } from '@/utils/date';
import { ZERO } from '@/utils/decimal';

/** Dias de histórico usados por padrão (a tela de detalhe e a de precisão podem pedir mais). */
export const LOOKBACK_DAYS = 120;
/** Horizontes avaliados no backtesting (só entram os que têm dias reais depois da origem). */
const HORIZONS = [7, 14, 30];
/** Modelos leves para as listas; o Holt-Winters entra no detalhe e no relatório de precisão. */
const LIST_MODELS: ModelId[] = ['gestock', 'naive', 'seasonal-naive'];
const ALL_MODELS: ModelId[] = ['gestock', 'naive', 'seasonal-naive', 'holt-winters'];

export const FORECAST_DISCLAIMER =
  'Previsões são estimativas calculadas a partir do histórico registrado e não representam valores exatos.';
export const DEMO_NOTICE = 'Ambiente de demonstração — dados simulados.';

const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const URGENCY_ORDER: ReorderUrgency[] = [
  'OUT_OF_STOCK',
  'URGENT',
  'LOW_STOCK_NO_HISTORY',
  'BUY',
  'OK',
  'NO_HISTORY',
];
const BASE_UNIT_LABEL: Record<BaseUnit, string> = { G: 'g', ML: 'ml', UN: 'un' };
/** Variável prevista de cada tipo de produto (unidades diferentes nunca se misturam). */
const PRODUCT_MEASURE: Record<PricingMode, { key: string; label: string }> = {
  UNIT: { key: 'product-units', label: 'unidades vendidas por dia' },
  WEIGHT: { key: 'product-sales', label: 'vendas (potes) por dia' },
};

function groupRows(rows: DailyRow[]) {
  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!map.has(r.id)) map.set(r.id, new Map());
    map.get(r.id)!.set(r.day, r.value);
  }
  return map;
}

/** Explicação determinística: só cita o que o algoritmo de fato usa. */
export function explainForecast(f: Forecast): string[] {
  if (f.status !== 'OK') return [f.message];
  const lines = [
    `A previsão parte da média ponderada dos últimos ${Math.min(f.historyDays, 28)} dias ` +
      '(os dias mais recentes pesam mais).',
  ];
  if (f.historyLevel === 'WEEKLY' && f.weekdayFactors) {
    const ranked = f.weekdayFactors
      .map((v, i) => ({ v, i }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v);
    const hi = ranked[0];
    const lo = ranked[ranked.length - 1];
    const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    lines.push(
      'Depois é ajustada pelo padrão de cada dia da semana' +
        (hi && lo && hi.i !== lo.i
          ? `: ${WEEKDAY[hi.i]} costuma ter ${fmt(hi.v)}× a média e ${WEEKDAY[lo.i]}, ${fmt(lo.v)}×.`
          : '.'),
    );
    const closed = f.weekdayFactors.map((v, i) => (v === 0 ? WEEKDAY[i] : null)).filter(Boolean);
    if (closed.length) lines.push(`Sem vendas registradas em: ${closed.join(', ')} (previsto 0).`);
  } else {
    lines.push('Com menos de 4 semanas de dados, o padrão por dia da semana ainda não é usado.');
  }
  if (f.outliersClipped > 0) {
    lines.push(
      `${f.outliersClipped} dia(s) muito fora do normal foram limitados para não distorcer a média ` +
        '(os registros não são alterados).',
    );
  }
  lines.push(
    f.bandCalibrated
      ? 'A faixa vai de 1 desvio abaixo a 1 acima do esperado, usando o erro medido nas ' +
          'simulações com dados passados (maior que a variação recente, por isso mais honesto).'
      : 'A faixa vai de 1 desvio padrão abaixo a 1 acima do esperado, medido nas diferenças entre ' +
          'o modelo e os dados recentes.',
  );
  if (f.totalFactor && f.totalFactor > 1) {
    lines.push(
      `Os erros costumam se repetir em dias seguidos (semanas inteiras acima ou abaixo do ` +
        `previsto): a faixa do total e a margem de segurança foram ampliadas ` +
        `${f.totalFactor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}×.`,
    );
  }
  lines.push('O modelo não considera preço, clima, feriados nem promoções.');
  return lines;
}

export interface WarningInput {
  forecast: Forecast;
  accuracy: AccuracySummary;
  isDemo: boolean;
  missingDays?: number;
}

export function forecastWarnings({ forecast, accuracy, isDemo, missingDays = 0 }: WarningInput) {
  const w: string[] = [];
  if (isDemo) w.push(DEMO_NOTICE);
  if (forecast.status !== 'OK') w.push(forecast.message);
  if (accuracy.evidence === 'INSUFFICIENT')
    w.push('Histórico insuficiente para avaliar a precisão.');
  if (accuracy.evidence === 'LIMITED')
    w.push('Poucos dados para validação: a precisão medida ainda é preliminar.');
  if (forecast.zeroShare !== null && forecast.zeroShare >= 0.5) {
    w.push(
      `Demanda irregular: em ${Math.round(forecast.zeroShare * 100)}% dos dias recentes não houve ` +
        'venda. O erro percentual tende a ser alto e a faixa é menos confiável.',
    );
  }
  if (accuracy.gestock?.wape != null && accuracy.gestock.wape > 0.5) {
    w.push(
      `Grandes erros nas avaliações históricas (erro médio de ${Math.round(accuracy.gestock.wape * 100)}%).`,
    );
  }
  if (accuracy.skill !== null && accuracy.skill < 0)
    w.push('Neste item, a previsão simples de referência errou menos que o modelo.');
  if (missingDays > 0) {
    w.push(
      `${missingDays} dia(s) com estoque zerado foram desconsiderados (a demanda não pôde ser observada).`,
    );
  }
  return w;
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

  productDetail(auth: AuthContext, productId: string, horizonDays: number, lookbackDays: number) {
    return withContext(auth, (tx) =>
      this.computeProductDetail(tx, auth.tenantId, productId, horizonDays, lookbackDays),
    );
  }

  reorder(auth: AuthContext, coverageDays: number) {
    return withContext(auth, (tx) => this.computeReorder(tx, auth.tenantId, coverageDays));
  }

  accuracy(auth: AuthContext, lookbackDays: number) {
    return withContext(auth, (tx) => this.computeAccuracy(tx, auth.tenantId, lookbackDays));
  }

  // ---------- Produtos ----------

  /** Séries diárias por produto ativo (do 1º dia vendido na janela até ontem). */
  private async productSeries(tx: Tx, tenantId: string, lookbackDays: number, productId?: string) {
    const { timezone, isDemo, yesterday, start } = await this.window(tx, tenantId, lookbackDays);
    const rows = await this.forecasts.productDailyDemand(
      tx,
      tenantId,
      timezone,
      start,
      yesterday,
      productId,
    );
    const byProduct = groupRows(rows);
    const imported = new Map<string, { total: number; imported: number }>();
    for (const r of rows) {
      const acc = imported.get(r.id) ?? { total: 0, imported: 0 };
      acc.total += r.value;
      acc.imported += r.imported;
      imported.set(r.id, acc);
    }
    const seriesOf = (id: string): DailyPoint[] => {
      const values = byProduct.get(id) ?? new Map<string, number>();
      const first = [...values.keys()].sort()[0];
      return first ? buildDailySeries(values, first, yesterday) : [];
    };
    const importedShare = (id: string) => {
      const acc = imported.get(id);
      return acc && acc.total > 0 ? round(acc.imported / acc.total, 3) : 0;
    };
    return { isDemo, yesterday, seriesOf, importedShare };
  }

  /** Demanda prevista por produto ativo, com a precisão medida no próprio histórico. */
  async computeProducts(tx: Tx, tenantId: string, horizonDays: number) {
    const { isDemo, yesterday, seriesOf, importedShare } = await this.productSeries(
      tx,
      tenantId,
      LOOKBACK_DAYS,
    );
    const products = await this.products.list(tx, tenantId, { active: true });

    const items = products.map((p) => {
      const series = seriesOf(p.id);
      const evaluation = backtest(series, {
        horizons: [...new Set([7, horizonDays])],
        models: LIST_MODELS,
      });
      // faixa calibrada pelo erro medido fora da amostra (quando há erros suficientes)
      const forecast = forecastDemand(series, horizonDays, {
        minSigma: evaluation.calibration.sigma,
        totalFactor: evaluation.calibration.totalFactor,
      });
      const accuracy = summarizeAccuracy(evaluation, horizonDays);
      return {
        product: { id: p.id, name: p.name, pricingMode: p.pricingMode },
        measure: PRODUCT_MEASURE[p.pricingMode].label,
        forecast,
        accuracy,
        importedShare: importedShare(p.id),
        warnings: forecastWarnings({ forecast, accuracy, isDemo }),
      };
    });

    items.sort((a, b) => (b.forecast.total?.expected ?? -1) - (a.forecast.total?.expected ?? -1));
    return {
      horizonDays,
      generatedFor: addDays(yesterday, 1),
      isDemo,
      disclaimer: FORECAST_DISCLAIMER,
      items,
    };
  }

  /** Um produto: histórico + previsão + avaliação completa (todos os modelos e horizontes). */
  async computeProductDetail(
    tx: Tx,
    tenantId: string,
    productId: string,
    horizonDays: number,
    lookbackDays: number,
  ) {
    const product = await this.products.findById(tx, tenantId, productId);
    if (!product) throw new AppError('Produto não encontrado', 404);
    const { isDemo, yesterday, seriesOf, importedShare } = await this.productSeries(
      tx,
      tenantId,
      lookbackDays,
      productId,
    );
    const series = seriesOf(productId);
    const evaluation = backtest(series, { horizons: HORIZONS, models: ALL_MODELS });
    const forecast = forecastDemand(series, horizonDays, {
      minSigma: evaluation.calibration.sigma,
      totalFactor: evaluation.calibration.totalFactor,
    });
    const accuracy = summarizeAccuracy(evaluation, horizonDays);

    return {
      product: { id: product.id, name: product.name, pricingMode: product.pricingMode },
      measure: PRODUCT_MEASURE[product.pricingMode].label,
      horizonDays,
      lookbackDays,
      generatedFor: addDays(yesterday, 1),
      isDemo,
      importedShare: importedShare(productId),
      disclaimer: FORECAST_DISCLAIMER,
      history: series,
      forecast,
      accuracy,
      evaluation: this.publicEvaluation(evaluation),
      explanation: explainForecast(forecast),
      warnings: forecastWarnings({ forecast, accuracy, isDemo }),
    };
  }

  // ---------- Ingredientes ----------

  /**
   * Séries de consumo por ingrediente ativo. Dias com o estoque zerado no início do dia e sem
   * consumo viram "sem observação" (null): não dá para saber quanto teria sido usado.
   */
  private async ingredientSeries(tx: Tx, tenantId: string, lookbackDays: number) {
    const { timezone, isDemo, yesterday, start } = await this.window(tx, tenantId, lookbackDays);

    const consumption = await this.forecasts.ingredientDailyConsumption(
      tx,
      tenantId,
      timezone,
      start,
      yesterday,
    );
    const net = groupRows(
      await this.forecasts.ingredientDailyNet(tx, tenantId, timezone, start, yesterday),
    );
    const firsts = await this.forecasts.ingredientFirstMovementDays(tx, tenantId, timezone);
    // Vendas importadas do histórico não baixaram estoque: o consumo delas é ESTIMADO pela
    // receita/composição e soma à série (marcada como estimada). Não mexe no saldo.
    const importedUse = groupRows(
      await this.forecasts.importedIngredientConsumption(tx, tenantId, timezone, start, yesterday),
    );
    const ingredients = await this.ingredients.listForReorder(tx, tenantId);
    const balances = await this.movements.balances(tx, tenantId);
    const startBalances = await this.movements.balances(
      tx,
      tenantId,
      undefined,
      new Date(this.forecasts.windowStart(timezone, start).getTime() - 1),
    );

    const estimated = new Set(consumption.filter((r) => r.estimated).map((r) => r.id));
    const realFirstDay = new Map(firsts.map((f) => [f.id, f.day]));

    // Ajustes do PRIMEIRO dia do ingrediente são a carga inicial (ex.: primeira contagem),
    // não correção de consumo — ficam de fora.
    const outflows = groupRows(
      consumption.map((r) => ({ id: r.id, day: r.day, value: r.outflow })),
    );
    const adjustments = groupRows(
      consumption
        .filter((r) => r.adjustment !== 0 && r.day !== realFirstDay.get(r.id))
        .map((r) => ({ id: r.id, day: r.day, value: r.adjustment })),
    );

    const items = ingredients.map((ing) => {
      const realFirst = realFirstDay.get(ing.id);
      const stockFirst = realFirst && realFirst < start ? start : realFirst;
      const imported = importedUse.get(ing.id) ?? new Map<string, number>();
      const importedFirst = [...imported.keys()].sort()[0];
      // a série começa no que vier antes: o 1º movimento de estoque ou a 1ª venda importada
      const first =
        stockFirst && importedFirst
          ? stockFirst < importedFirst
            ? stockFirst
            : importedFirst
          : (stockFirst ?? importedFirst);
      const out = outflows.get(ing.id) ?? new Map<string, number>();
      // a correção pelas contagens vale só para o consumo registrado no estoque (não para a
      // estimativa do histórico importado, que é de outro período)
      const daily = correctConsumption(out, adjustments.get(ing.id) ?? new Map());
      for (const [day, qty] of imported) daily.set(day, (daily.get(day) ?? 0) + qty);

      // Dias sem estoque: a demanda daquele dia não pôde acontecer (vira "sem observação").
      // Só a partir do 1º movimento de estoque (antes dele o saldo não é conhecido).
      const missing =
        stockFirst && stockFirst <= yesterday
          ? stockoutDays({
              start,
              end: yesterday,
              first: stockFirst,
              startBalance: (startBalances.get(ing.id) ?? ZERO).toNumber(),
              net: net.get(ing.id) ?? new Map<string, number>(),
              // dia com saída registrada OU consumo de venda importada teve demanda observada
              outflow: new Map(
                [...new Set([...imported.keys(), ...out.keys()])].map((d) => [
                  d,
                  (imported.get(d) ?? 0) + (out.get(d) ?? 0),
                ]),
              ),
            })
          : new Set<string>();
      const series =
        first && first <= yesterday ? buildDailySeries(daily, first, yesterday, missing) : [];
      return {
        ing,
        series,
        missingDays: missing.size,
        stock: (balances.get(ing.id) ?? ZERO).toNumber(),
        usesEstimatedData: estimated.has(ing.id) || imported.size > 0,
      };
    });
    return { isDemo, yesterday, items };
  }

  /** Sugestão de compra por ingrediente para cobrir prazo de entrega + `coverageDays`. */
  async computeReorder(tx: Tx, tenantId: string, coverageDays: number) {
    const {
      isDemo,
      yesterday,
      items: series,
    } = await this.ingredientSeries(tx, tenantId, LOOKBACK_DAYS);

    const items = series.map(({ ing, series: s, missingDays, stock, usesEstimatedData }) => {
      const evaluation = backtest(s, { horizons: [7], models: LIST_MODELS });
      const forecast = forecastDemand(s, ing.leadTimeDays + coverageDays, {
        minSigma: evaluation.calibration.sigma,
        totalFactor: evaluation.calibration.totalFactor,
      });
      const accuracy = summarizeAccuracy(evaluation, 7);
      const unit = BASE_UNIT_LABEL[ing.baseUnit];
      const recommendation = recommendReorder({
        stock,
        minStock: ing.minStock.toNumber(),
        leadTimeDays: ing.leadTimeDays,
        coverageDays,
        forecast,
        measuredErrorStd: evaluation.calibration.sigma,
        unit,
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
        usesEstimatedData,
        missingDays,
        forecast: {
          status: forecast.status,
          historyLevel: forecast.historyLevel,
          historyDays: forecast.historyDays,
          observedDays: forecast.observedDays,
          averageDaily: forecast.averageDaily,
          stdDevDaily: forecast.stdDevDaily,
          zeroShare: forecast.zeroShare,
          total: forecast.total,
          message: forecast.message,
        },
        accuracy,
        warnings: forecastWarnings({ forecast, accuracy, isDemo, missingDays }),
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
      isDemo,
      disclaimer: FORECAST_DISCLAIMER,
      items,
    };
  }

  // ---------- Precisão da loja ----------

  /**
   * Relatório de precisão: backtesting de todas as séries, agregado por UNIDADE (unidades,
   * potes, gramas, mililitros e pedidos nunca se misturam), com os quatro modelos.
   */
  async computeAccuracy(tx: Tx, tenantId: string, lookbackDays: number) {
    const { timezone, isDemo, yesterday, start } = await this.window(tx, tenantId, lookbackDays);
    const products = await this.products.list(tx, tenantId, { active: true });
    const prod = await this.productSeries(tx, tenantId, lookbackDays);
    const ingr = await this.ingredientSeries(tx, tenantId, lookbackDays);
    const orders = await this.forecasts.storeDailyOrders(tx, tenantId, timezone, start, yesterday);

    type Entry = { id: string; name: string; result: BacktestResult };
    const groups = new Map<string, { label: string; unit: string; entries: Entry[] }>();
    const add = (key: string, label: string, unit: string, entry: Entry) => {
      if (!groups.has(key)) groups.set(key, { label, unit, entries: [] });
      groups.get(key)!.entries.push(entry);
    };
    const run = (s: DailyPoint[]) => backtest(s, { horizons: HORIZONS, models: ALL_MODELS });

    // Loja inteira: pedidos por dia.
    const orderValues = new Map(orders.map((o) => [o.day, o.value]));
    const firstOrderDay = orders.map((o) => o.day).sort()[0];
    const storeSeries = firstOrderDay
      ? buildDailySeries(orderValues, firstOrderDay, yesterday)
      : [];
    add('store-orders', 'Loja: pedidos por dia', 'pedidos', {
      id: tenantId,
      name: 'Todos os pedidos',
      result: run(storeSeries),
    });

    for (const p of products) {
      const m = PRODUCT_MEASURE[p.pricingMode];
      add(m.key, `Produtos: ${m.label}`, p.pricingMode === 'WEIGHT' ? 'vendas' : 'un', {
        id: p.id,
        name: p.name,
        result: run(prod.seriesOf(p.id)),
      });
    }
    for (const { ing, series } of ingr.items) {
      add(
        `ingredient-${ing.baseUnit}`,
        `Ingredientes: consumo em ${BASE_UNIT_LABEL[ing.baseUnit]} por dia`,
        BASE_UNIT_LABEL[ing.baseUnit],
        { id: ing.id, name: ing.name, result: run(series) },
      );
    }

    const importedOrders = orders.reduce((s, o) => s + o.imported, 0);
    const totalOrders = orders.reduce((s, o) => s + o.value, 0);

    return {
      lookbackDays,
      generatedFor: addDays(yesterday, 1),
      isDemo,
      dataSource: isDemo ? 'DEMO' : importedOrders > 0 ? 'REGISTERED_AND_IMPORTED' : 'REGISTERED',
      importedShare: totalOrders > 0 ? round(importedOrders / totalOrders, 3) : 0,
      disclaimer: isDemo ? DEMO_NOTICE : FORECAST_DISCLAIMER,
      models: ALL_MODELS.map((id) => ({ id, label: MODEL_LABEL[id] })),
      horizons: HORIZONS,
      groups: [...groups.entries()].map(([key, g]) => {
        const results = g.entries.map((e) => e.result);
        const byHorizon = HORIZONS.map((h) => ({
          horizon: h,
          models: ALL_MODELS.map((id) => ({ model: id, ...pooledMetrics(results, id, h) })),
        }));
        const ranked = g.entries
          .map((e) => ({ id: e.id, name: e.name, accuracy: summarizeAccuracy(e.result, 7) }))
          .filter((e) => e.accuracy.gestock?.wape != null);
        ranked.sort((a, b) => a.accuracy.gestock!.wape! - b.accuracy.gestock!.wape!);
        return {
          key,
          label: g.label,
          unit: g.unit,
          series: g.entries.length,
          evaluatedSeries: ranked.length,
          byHorizon,
          // Onde o modelo foi melhor e pior (h = 7, WAPE): ajuda a decidir onde confiar.
          best: ranked.slice(0, 3),
          worst: ranked.slice(-3).reverse(),
        };
      }),
    };
  }

  /** Avaliação sem as somas internas (a tela usa as métricas prontas). */
  private publicEvaluation(r: BacktestResult) {
    return {
      ...r,
      models: Object.fromEntries(
        Object.entries(r.models).map(([id, hs]) => [id, hs!.map(({ sums: _sums, ...h }) => h)]),
      ),
      labels: MODEL_LABEL,
    };
  }

  /** Janela de análise: até ONTEM (o dia de hoje ainda está incompleto). */
  private async window(tx: Tx, tenantId: string, lookbackDays: number) {
    const { timezone, isDemo } = await this.tenants.findForecastInfo(tx, tenantId);
    const yesterday = addDays(todayIn(timezone), -1);
    return { timezone, isDemo, yesterday, start: addDays(yesterday, -(lookbackDays - 1)) };
  }
}

export const forecastService = new ForecastService(
  forecastRepository,
  productRepository,
  ingredientRepository,
  stockMovementRepository,
  tenantRepository,
);
