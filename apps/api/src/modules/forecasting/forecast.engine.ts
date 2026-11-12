/**
 * Motor de previsão v1 — simples, explicável e honesto.
 *
 * - < 7 dias de histórico ............ não prevê (INSUFFICIENT_HISTORY)
 * - 7 a 27 dias ...................... média móvel ponderada (confiança BAIXA)
 * - ≥ 28 dias ........................ + fator por dia da semana (confiança MÉDIA)
 * - ≥ 90 dias e variação baixa ....... confiança ALTA
 *
 * O resultado é sempre uma FAIXA (low–high), nunca um número exato.
 */
import { addDays } from '../../common/schemas';

export const MIN_HISTORY_DAYS = 7;
export const SEASONAL_MIN_DAYS = 28;
export const HIGH_CONFIDENCE_DAYS = 90;
const WMA_WINDOW = 28;
const SEASONAL_WINDOW = 84;

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface ForecastDay {
  date: string;
  weekday: number; // 0 = domingo
  expected: number;
  low: number;
  high: number;
}

export interface Forecast {
  status: 'OK' | 'INSUFFICIENT_HISTORY';
  historyDays: number;
  confidence: Confidence | null;
  method: string | null;
  averageDaily: number | null;
  stdDevDaily: number | null;
  total: { expected: number; low: number; high: number } | null;
  daily: ForecastDay[];
  message: string;
}

const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places;
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Preenche os dias sem movimento com zero, de `start` até `end` (inclusive). */
export function buildDailySeries(values: Map<string, number>, start: string, end: string): DailyPoint[] {
  const series: DailyPoint[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    series.push({ date: d, value: values.get(d) ?? 0 });
  }
  return series;
}

/** Fator de cada dia da semana = média do dia ÷ média geral (1 = dia "normal"). */
export function weekdayFactors(series: DailyPoint[]): number[] {
  const recent = series.slice(-SEASONAL_WINDOW);
  const overall = mean(recent.map((p) => p.value));
  if (overall <= 0) return Array(7).fill(1);
  return Array.from({ length: 7 }, (_, wd) => {
    const values = recent.filter((p) => weekdayOf(p.date) === wd).map((p) => p.value);
    return values.length ? mean(values) / overall : 1;
  });
}

export function forecastDemand(series: DailyPoint[], horizonDays: number): Forecast {
  const n = series.length;
  if (n < MIN_HISTORY_DAYS) {
    return {
      status: 'INSUFFICIENT_HISTORY',
      historyDays: n,
      confidence: null,
      method: null,
      averageDaily: null,
      stdDevDaily: null,
      total: null,
      daily: [],
      message: `Histórico insuficiente: ${n} dia(s) registrados, mínimo de ${MIN_HISTORY_DAYS}.`,
    };
  }

  const seasonal = n >= SEASONAL_MIN_DAYS;
  const factors = seasonal ? weekdayFactors(series) : Array(7).fill(1);
  const window = series.slice(-WMA_WINDOW);

  // Média móvel ponderada (dias recentes pesam mais) sobre a série sem o efeito do dia da semana.
  let weighted = 0;
  let weights = 0;
  window.forEach((p, i) => {
    const f = factors[weekdayOf(p.date)];
    if (f > 0) {
      weighted += (i + 1) * (p.value / f);
      weights += i + 1;
    }
  });
  const base = weights ? weighted / weights : 0;

  // Desvio padrão dos resíduos = incerteza diária.
  const residuals = window.map((p) => p.value - base * factors[weekdayOf(p.date)]);
  const std =
    residuals.length > 1
      ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (residuals.length - 1))
      : 0;
  const avg = mean(window.map((p) => p.value));
  const cv = avg > 0 ? std / avg : 0;

  const confidence: Confidence =
    n < SEASONAL_MIN_DAYS ? 'LOW' : n >= HIGH_CONFIDENCE_DAYS && avg > 0 && cv <= 0.5 ? 'HIGH' : 'MEDIUM';

  const last = series[n - 1].date;
  const daily: ForecastDay[] = Array.from({ length: horizonDays }, (_, h) => {
    const date = addDays(last, h + 1);
    const weekday = weekdayOf(date);
    const expected = base * factors[weekday];
    return {
      date,
      weekday,
      expected: round(expected),
      low: round(Math.max(0, expected - std)),
      high: round(expected + std),
    };
  });

  const totalExpected = daily.reduce((s, d) => s + d.expected, 0);
  const totalBand = std * Math.sqrt(horizonDays);

  return {
    status: 'OK',
    historyDays: n,
    confidence,
    method: seasonal ? 'weighted-moving-average+weekday' : 'weighted-moving-average',
    averageDaily: round(avg),
    stdDevDaily: round(std),
    total: {
      expected: round(totalExpected),
      low: round(Math.max(0, totalExpected - totalBand)),
      high: round(totalExpected + totalBand),
    },
    daily,
    message:
      confidence === 'LOW'
        ? 'Estimativa com pouco histórico: use como referência, não como valor exato.'
        : 'Estimativa baseada no histórico registrado.',
  };
}

// ---------- Reposição ----------

export type ReorderUrgency = 'OUT_OF_STOCK' | 'URGENT' | 'BUY' | 'OK' | 'LOW_STOCK_NO_HISTORY' | 'NO_HISTORY';

export interface ReorderInput {
  stock: number;
  minStock: number;
  leadTimeDays: number;
  coverageDays: number;
  /** Previsão calculada com horizonte = leadTimeDays + coverageDays. */
  forecast: Forecast;
  /** 1,65 ≈ 95% de chance de não faltar durante o prazo de entrega. */
  serviceZ?: number;
}

export interface ReorderRecommendation {
  urgency: ReorderUrgency;
  suggestedQuantity: number | null;
  demandDuringCoverage: number | null;
  safetyStock: number | null;
  daysUntilStockout: number | null;
  explanation: string;
}

export function recommendReorder(input: ReorderInput): ReorderRecommendation {
  const { stock, minStock, leadTimeDays, coverageDays, forecast } = input;
  const z = input.serviceZ ?? 1.65;

  if (forecast.status !== 'OK' || !forecast.total) {
    const low = stock <= 0 || (minStock > 0 && stock <= minStock);
    return {
      urgency: low ? 'LOW_STOCK_NO_HISTORY' : 'NO_HISTORY',
      suggestedQuantity: null,
      demandDuringCoverage: null,
      safetyStock: null,
      daysUntilStockout: null,
      explanation: low
        ? 'Estoque abaixo do mínimo, mas ainda não há histórico para calcular quanto comprar.'
        : forecast.message,
    };
  }

  const avg = forecast.averageDaily ?? 0;
  const std = forecast.stdDevDaily ?? 0;
  const demand = forecast.total.expected;
  const safety = z * std * Math.sqrt(Math.max(leadTimeDays, 1));
  const suggested = Math.max(0, demand + safety - stock);
  const daysUntilStockout = stock <= 0 ? 0 : avg > 0 ? stock / avg : null;

  const urgency: ReorderUrgency =
    stock <= 0
      ? 'OUT_OF_STOCK'
      : daysUntilStockout !== null && daysUntilStockout <= leadTimeDays
        ? 'URGENT'
        : suggested > 0
          ? 'BUY'
          : 'OK';

  const coverage = leadTimeDays + coverageDays;
  return {
    urgency,
    suggestedQuantity: round(suggested),
    demandDuringCoverage: round(demand),
    safetyStock: round(safety),
    daysUntilStockout: daysUntilStockout === null ? null : round(daysUntilStockout, 1),
    explanation:
      `Consumo estimado de ${round(demand, 1)} nos próximos ${coverage} dias ` +
      `(entrega em ${leadTimeDays} + ${coverageDays} de cobertura), ` +
      `mais ${round(safety, 1)} de margem de segurança, menos o saldo atual de ${round(stock, 1)}.`,
  };
}
