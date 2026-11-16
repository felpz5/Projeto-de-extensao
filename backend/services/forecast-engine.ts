/**
 * Motor de previsão do Gestock — simples, explicável e honesto.
 *
 * Modelo ("gestock"): decomposição multiplicativa da série diária em
 *   previsão(dia) = nível × fator do dia da semana
 * - nível  = média móvel ponderada linear (pesos 1..28, o dia mais recente pesa mais) da série
 *            SEM o efeito do dia da semana, com dias atípicos limitados (filtro de Hampel)
 * - fator  = média daquele dia da semana ÷ média geral (últimos 84 dias), a partir de 28 dias
 *
 * Histórico:
 * - < 7 dias observados ....... não prevê (INSUFFICIENT_HISTORY)
 * - 7 a 27 dias ............... só nível (historyLevel SHORT)
 * - ≥ 28 dias ................. nível + fator por dia da semana (historyLevel WEEKLY)
 *
 * O resultado é sempre uma FAIXA. A precisão real NÃO é decidida aqui: ela é medida fora da
 * amostra pelo backtesting (forecast-evaluation.ts).
 */
import type {
  DailyPoint,
  Forecast,
  ForecastDay,
  ReorderInput,
  ReorderRecommendation,
  ReorderUrgency,
} from '@/types/forecast.types';
import { addDays } from '@/utils/date';

export const MIN_HISTORY_DAYS = 7;
export const SEASONAL_MIN_DAYS = 28;
/** Cada dia da semana precisa de pelo menos 2 observações para ter fator próprio. */
const MIN_PER_WEEKDAY = 2;
const WMA_WINDOW = 28;
const SEASONAL_WINDOW = 84;
/** Hampel: valores além de mediana ± 3 × 1,4826 × MAD são limitados (≈ 3 desvios na normal). */
const HAMPEL_K = 3;
const MAD_TO_SIGMA = 1.4826;

export const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places;
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const observed = (series: DailyPoint[]) =>
  series.filter((p): p is { date: string; value: number } => p.value !== null);

/**
 * Corrige o consumo registrado com os ajustes de inventário do mesmo período.
 * - Ajuste negativo = consumiu MAIS do que o registrado; positivo = consumiu MENOS.
 * - A correção é distribuída proporcionalmente nos dias (não cria pico no dia da contagem).
 * - Sem nenhuma saída registrada, os ajustes negativos são o único sinal de consumo.
 */
export function correctConsumption(
  outflow: Map<string, number>,
  adjustments: Map<string, number>,
): Map<string, number> {
  const totalOut = [...outflow.values()].reduce((a, b) => a + b, 0);
  const netAdjustment = [...adjustments.values()].reduce((a, b) => a + b, 0);
  if (totalOut > 0) {
    const factor = Math.max(0, (totalOut - netAdjustment) / totalOut);
    return new Map([...outflow].map(([day, value]) => [day, value * factor]));
  }
  return new Map([...adjustments].filter(([, v]) => v < 0).map(([day, v]) => [day, -v]));
}

/**
 * Série diária de `start` até `end` (inclusive): dias sem movimento viram 0; dias em `missing`
 * viram null (sem observação válida — ex.: estoque zerado, a demanda não pôde acontecer).
 */
export function buildDailySeries(
  values: Map<string, number>,
  start: string,
  end: string,
  missing: ReadonlySet<string> = new Set(),
): DailyPoint[] {
  const series: DailyPoint[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    series.push({ date: d, value: missing.has(d) ? null : (values.get(d) ?? 0) });
  }
  return series;
}

/**
 * Fator de cada dia da semana = média do dia ÷ média geral (1 = dia "normal"), nos últimos 84
 * dias. Dia da semana com menos de 2 observações fica com fator 1 (sem evidência).
 */
export function weekdayFactors(series: DailyPoint[]): number[] {
  const recent = observed(series.slice(-SEASONAL_WINDOW));
  // Atípicos limitados DENTRO de cada dia da semana (um sábado excepcional não pode inflar o
  // fator de todos os sábados).
  const groups = Array.from(
    { length: 7 },
    (_, wd) =>
      clipOutliers(recent.filter((p) => weekdayOf(p.date) === wd).map((p) => p.value)).values,
  );
  const all = groups.flat();
  const overall = mean(all);
  if (overall <= 0) return Array(7).fill(1);
  return groups.map((values) => (values.length >= MIN_PER_WEEKDAY ? mean(values) / overall : 1));
}

/**
 * Limita valores atípicos (Hampel): fora de mediana ± k·1,4826·MAD vira o próprio limite.
 * Com MAD = 0 (ex.: maioria dos dias igual ou zerada) não limita nada — senão toda venda
 * diferente da mediana seria tratada como atípica.
 */
export function clipOutliers(values: number[]): { values: number[]; clipped: number } {
  const m = median(values);
  const mad = median(values.map((v) => Math.abs(v - m)));
  if (mad === 0) return { values, clipped: 0 };
  const lim = HAMPEL_K * MAD_TO_SIGMA * mad;
  let clipped = 0;
  const out = values.map((v) => {
    const c = Math.min(Math.max(v, m - lim), m + lim);
    if (c !== v) clipped++;
    return c;
  });
  return { values: out, clipped };
}

export interface ForecastOptions {
  /**
   * Desvio mínimo da faixa: o erro diário medido FORA da amostra (RMSE do backtesting). O desvio
   * dentro da amostra tende a subestimar o erro real; com isto a faixa fica calibrada.
   */
  minSigma?: number | null;
  /**
   * Fator de correlação dos erros (≥ 1) medido no backtesting: a faixa do TOTAL vira
   * σ·√H·fator em vez de σ·√H, que supõe erros diários independentes.
   */
  totalFactor?: number | null;
}

export function forecastDemand(
  series: DailyPoint[],
  horizonDays: number,
  opts: ForecastOptions = {},
): Forecast {
  const n = series.length;
  const obs = observed(series);
  const empty = {
    historyDays: n,
    observedDays: obs.length,
    historyLevel: null,
    method: null,
    averageDaily: null,
    stdDevDaily: null,
    bandSigma: null,
    bandCalibrated: false,
    totalFactor: null,
    weekdayFactors: null,
    zeroShare: null,
    outliersClipped: 0,
    total: null,
    daily: [],
  };
  if (obs.length < MIN_HISTORY_DAYS) {
    const missing = n - obs.length;
    return {
      ...empty,
      status: 'INSUFFICIENT_HISTORY',
      message:
        `Histórico insuficiente: ${obs.length} dia(s) com dados, mínimo de ${MIN_HISTORY_DAYS}` +
        (missing > 0 ? ` (${missing} dia(s) sem estoque não contam).` : '.'),
    };
  }

  const seasonal = n >= SEASONAL_MIN_DAYS && obs.length >= SEASONAL_MIN_DAYS - 7;
  const factors = seasonal ? weekdayFactors(series) : Array(7).fill(1);
  // Janela do nível: os últimos 28 dias do calendário. Se quase todos estão sem observação
  // (ex.: ingrediente em falta há semanas), usa os últimos 28 dias COM dados — senão a demanda
  // escondida pela falta viraria previsão zero e a sugestão seria "não comprar".
  let window = observed(series.slice(-WMA_WINDOW));
  let firstDate = series[Math.max(0, n - WMA_WINDOW)].date;
  if (window.length < MIN_HISTORY_DAYS) {
    window = obs.slice(-WMA_WINDOW);
    firstDate = window[0].date;
  }

  // Nível: média ponderada da série dessazonalizada. Dias com fator 0 (loja fechada naquele
  // dia da semana) não informam o nível e ficam de fora.
  const usable = window.filter((p) => factors[weekdayOf(p.date)] > 0);
  const deseason = usable.map((p) => p.value / factors[weekdayOf(p.date)]);
  const { values: robust, clipped } = clipOutliers(deseason);
  // Peso pela POSIÇÃO no calendário (não pela ordem dos observados): dia faltante não "empurra"
  // os antigos para frente.
  const dayIndex = (d: string) => (Date.parse(d) - Date.parse(firstDate)) / 86_400_000 + 1;
  let weighted = 0;
  let weights = 0;
  usable.forEach((p, i) => {
    const w = dayIndex(p.date);
    weighted += w * robust[i];
    weights += w;
  });
  const base = weights ? weighted / weights : 0;

  // Desvio padrão dos resíduos dentro da janela (incerteza diária do MODELO; o erro real é
  // medido fora da amostra no backtesting).
  const residuals = window.map((p) => p.value - base * factors[weekdayOf(p.date)]);
  const std =
    residuals.length > 1
      ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (residuals.length - 1))
      : 0;
  const avg = mean(window.map((p) => p.value));
  const zeroShare = window.length ? window.filter((p) => p.value === 0).length / window.length : 0;

  const last = series[n - 1].date;
  // Faixa: o maior entre o desvio do modelo e o erro medido fora da amostra.
  const bandCalibrated = (opts.minSigma ?? 0) > std;
  const band = Math.max(std, opts.minSigma ?? 0);
  const daily: ForecastDay[] = Array.from({ length: horizonDays }, (_, h) => {
    const date = addDays(last, h + 1);
    const weekday = weekdayOf(date);
    const expected = base * factors[weekday];
    return {
      date,
      weekday,
      expected: round(expected),
      low: round(Math.max(0, expected - band)),
      high: round(expected + band),
    };
  });

  // Faixa do total: σ·√h supõe erros diários independentes (aproximação; a cobertura real é
  // medida no backtesting).
  const totalExpected = daily.reduce((s, d) => s + d.expected, 0);
  const totalFactor = Math.max(1, opts.totalFactor ?? 1);
  const totalBand = band * Math.sqrt(horizonDays) * totalFactor;

  return {
    status: 'OK',
    historyDays: n,
    observedDays: obs.length,
    historyLevel: seasonal ? 'WEEKLY' : 'SHORT',
    method: seasonal ? 'weighted-moving-average+weekday' : 'weighted-moving-average',
    averageDaily: round(avg),
    stdDevDaily: round(std),
    bandSigma: round(band),
    bandCalibrated,
    totalFactor: round(totalFactor),
    weekdayFactors: factors.map((f) => round(f)),
    zeroShare: round(zeroShare),
    outliersClipped: clipped,
    total: {
      expected: round(totalExpected),
      low: round(Math.max(0, totalExpected - totalBand)),
      high: round(totalExpected + totalBand),
    },
    daily,
    message: seasonal
      ? 'Estimativa baseada nas vendas recentes e no padrão de cada dia da semana.'
      : 'Estimativa com pouco histórico (sem padrão por dia da semana): use como referência.',
  };
}

/**
 * Dias sem estoque de um ingrediente (demanda não observável): saldo ≤ 0 no INÍCIO e no FIM do
 * dia e nenhuma saída registrada. Olhar só o início marcaria, por engano, o dia em que o
 * estoque inicial ou uma compra chegou (começa em 0, termina positivo).
 */
export function stockoutDays(opts: {
  start: string;
  end: string;
  /** Primeiro dia com movimentação do ingrediente (antes dele não há série). */
  first: string;
  /** Saldo imediatamente antes de `start`. */
  startBalance: number;
  /** Variação líquida do saldo em cada dia (todas as movimentações). */
  net: ReadonlyMap<string, number>;
  /** Saídas registradas em cada dia. */
  outflow: ReadonlyMap<string, number>;
}): Set<string> {
  const missing = new Set<string>();
  let bal = opts.startBalance;
  for (let d = opts.start; d <= opts.end; d = addDays(d, 1)) {
    const endBal = bal + (opts.net.get(d) ?? 0);
    if (d >= opts.first && bal <= 1e-9 && endBal <= 1e-9 && !(opts.outflow.get(d) ?? 0)) {
      missing.add(d);
    }
    bal = endBal;
  }
  return missing;
}

// ---------- Reposição ----------

/**
 * Dias até o estoque acabar, somando a previsão dia a dia (respeita o dia da semana). Além do
 * horizonte calculado, continua com a média diária prevista.
 */
export function daysUntilStockout(stock: number, forecast: Forecast): number | null {
  if (stock <= 0) return 0;
  const daily = forecast.daily.map((d) => d.expected);
  let left = stock;
  for (let i = 0; i < daily.length; i++) {
    if (daily[i] >= left) return i + left / daily[i];
    left -= daily[i];
  }
  const avg = mean(daily);
  return avg > 0 ? daily.length + left / avg : null;
}

/**
 * Sugestão de compra (revisão periódica):
 *   período de proteção P = prazo de entrega (L) + intervalo até a próxima compra (R)
 *   demanda_P   = soma da previsão diária nos P dias
 *   segurança   = z × σ × √P        (σ = maior entre o desvio do modelo e o erro medido)
 *   sugestão    = max(0, demanda_P + segurança − saldo)
 * A margem usa aproximação normal com erros independentes: reduz, mas não elimina, o risco
 * de faltar (ver docs/extensao-2026-2/03-metodologia-estatistica.md).
 */
export function recommendReorder(input: ReorderInput): ReorderRecommendation {
  const { stock, minStock, leadTimeDays, coverageDays, forecast } = input;
  const z = input.serviceZ ?? 1.65;
  const unit = input.unit ? ` ${input.unit}` : '';
  const fmt = (v: number) => `${round(v, 1).toLocaleString('pt-BR')}${unit}`;

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

  const protection = Math.max(leadTimeDays + coverageDays, 1);
  const sigma = Math.max(
    forecast.bandSigma ?? forecast.stdDevDaily ?? 0,
    input.measuredErrorStd ?? 0,
  );
  const demand = forecast.total.expected;
  // erros que se repetem em dias seguidos aumentam a incerteza da soma (fator ≥ 1 medido)
  const safety = z * sigma * Math.sqrt(protection) * Math.max(1, forecast.totalFactor ?? 1);
  const suggested = Math.max(0, demand + safety - stock);
  const lasts = daysUntilStockout(stock, forecast);

  const urgency: ReorderUrgency =
    stock <= 0
      ? 'OUT_OF_STOCK'
      : lasts !== null && lasts <= leadTimeDays
        ? 'URGENT'
        : suggested > 0
          ? 'BUY'
          : 'OK';

  return {
    urgency,
    suggestedQuantity: round(suggested),
    demandDuringCoverage: round(demand),
    safetyStock: round(safety),
    daysUntilStockout: lasts === null ? null : round(lasts, 1),
    explanation:
      `Considerando a demanda prevista de ${fmt(demand)} para ${protection} dia(s) ` +
      `(entrega em ${leadTimeDays} + ${coverageDays} até a próxima compra), ` +
      `a margem de segurança de ${fmt(safety)} e o saldo atual de ${fmt(stock)}, ` +
      `a quantidade sugerida é ${fmt(suggested)}. ` +
      'A margem reduz, mas não elimina, o risco de faltar.',
  };
}
