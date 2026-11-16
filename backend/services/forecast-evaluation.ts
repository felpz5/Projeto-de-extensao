/**
 * Avaliação das previsões fora da amostra (backtesting cronológico).
 *
 * Ideia: "voltar no tempo". Em cada data de corte (origem) o modelo recebe SÓ os dias até
 * ali, prevê os próximos H dias, e a previsão é comparada com o que aconteceu de fato.
 * - Janela crescente (expanding window): origens a cada `step` dias, a partir de `minTrain`.
 * - Todos os modelos são avaliados nas MESMAS origens e nos MESMOS dias (comparação justa).
 * - Horizonte H só é avaliado nas origens que têm os H dias seguintes disponíveis.
 * - Dias sem observação válida (null) não entram nas métricas.
 *
 * Sem vazamento de dados futuros por construção: o modelo recebe `series.slice(0, origem + 1)`
 * e recalcula tudo (nível, fatores, parâmetros) a cada origem. Ver o teste em
 * test/unit/forecast-evaluation.spec.ts ("não usa dados futuros").
 */
import { forecastDemand, round } from '@/services/forecast-engine';
import type { DailyPoint } from '@/types/forecast.types';

// ---------- Modelos ----------

export type ModelId = 'gestock' | 'naive' | 'seasonal-naive' | 'holt-winters';

export const MODEL_LABEL: Record<ModelId, string> = {
  gestock: 'Gestock (média ponderada + dia da semana)',
  naive: 'Ingênuo (repete o último dia)',
  'seasonal-naive': 'Ingênuo sazonal (repete o mesmo dia da semana anterior)',
  'holt-winters': 'Holt-Winters aditivo amortecido (sazonalidade semanal)',
};

export interface ModelForecast {
  expected: number[];
  /** Faixa do próprio modelo, quando ele tem uma (para medir a cobertura). */
  low?: number[];
  high?: number[];
}

/** Recebe só o passado (`train`) e devolve `horizon` dias, ou null se não consegue prever. */
export type Model = (train: DailyPoint[], horizon: number) => ModelForecast | null;

const lastObserved = (train: DailyPoint[]) => {
  for (let i = train.length - 1; i >= 0; i--) if (train[i].value !== null) return train[i].value;
  return null;
};

export const gestockModel: Model = (train, horizon) => {
  const f = forecastDemand(train, horizon);
  if (f.status !== 'OK') return null;
  return {
    expected: f.daily.map((d) => d.expected),
    low: f.daily.map((d) => d.low),
    high: f.daily.map((d) => d.high),
  };
};

/** Referência 1: o último valor observado, repetido. */
export const naiveModel: Model = (train, horizon) => {
  const v = lastObserved(train);
  return v === null ? null : { expected: Array(horizon).fill(v) };
};

/** Referência 2: o valor do mesmo dia da semana na semana anterior (último observado). */
export const seasonalNaiveModel: Model = (train, horizon) => {
  const n = train.length;
  if (n < 7) return null;
  const expected: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    let idx = n - 1 + h - 7 * Math.ceil(h / 7);
    while (idx >= 0 && train[idx].value === null) idx -= 7;
    if (idx < 0) return null;
    expected.push(train[idx].value as number);
  }
  return { expected };
};

/**
 * Holt-Winters aditivo com tendência amortecida e sazonalidade semanal (m = 7).
 *   nível   ℓt = α(yt − s(t−7)) + (1 − α)(ℓ(t−1) + φ·b(t−1))
 *   tend.   bt = β(ℓt − ℓ(t−1)) + (1 − β)·φ·b(t−1)
 *   sazon.  st = γ(yt − ℓt) + (1 − γ)·s(t−7)
 *   prev.   ŷ(t+h) = ℓt + (φ + … + φ^h)·bt + s(t+h−7k)
 * Aditivo (não multiplicativo) porque séries de loja têm dias com zero. Parâmetros escolhidos
 * por grade, minimizando o erro de 1 passo DENTRO do treino. Dia sem observação: o estado
 * avança com a própria previsão. Precisa de 14+ dias (duas semanas para iniciar).
 */
export const holtWintersModel: Model = (train, horizon) => {
  const n = train.length;
  if (n < 14 || train.filter((p) => p.value !== null).length < 14) return null;
  const y = train.map((p) => p.value);
  // Estado inicial pelas duas primeiras semanas, IGNORANDO dias sem observação (tratá-los como
  // zero puxaria o nível e o fator daquele dia da semana para baixo).
  const meanObs = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? { mean: v.reduce((a, b) => a + b, 0) / v.length, n: v.length } : null;
  };
  const all14 = meanObs(y.slice(0, 14))!;
  const w1 = meanObs(y.slice(0, 7));
  const w2 = meanObs(y.slice(7, 14));
  const m1 = w1?.mean ?? all14.mean;
  const m2 = w2?.mean ?? all14.mean;
  // tendência inicial só com pelo menos 3 dias observados em cada semana
  const b0 = w1 && w2 && w1.n >= 3 && w2.n >= 3 ? (m2 - m1) / 7 : 0;
  const s0 = Array.from({ length: 7 }, (_, j) => {
    const offsets = [
      y[j] !== null ? y[j]! - m1 : null,
      y[j + 7] !== null ? y[j + 7]! - m2 : null,
    ].filter((v): v is number => v !== null);
    return offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : 0;
  });

  let best: { sse: number; l: number; b: number; s: number[]; phi: number } | null = null;
  for (const alpha of [0.1, 0.2, 0.3, 0.5])
    for (const beta of [0, 0.05, 0.15])
      for (const gamma of [0.05, 0.15, 0.3])
        for (const phi of [0.8, 0.9, 0.98]) {
          let l = m1;
          let b = b0;
          const s = [...s0];
          let sse = 0;
          for (let t = 7; t < n; t++) {
            const season = s[t % 7];
            const pred = l + phi * b + season;
            const obs = y[t] ?? pred;
            if (y[t] !== null) sse += (obs - pred) ** 2;
            const nl = alpha * (obs - season) + (1 - alpha) * (l + phi * b);
            b = beta * (nl - l) + (1 - beta) * phi * b;
            s[t % 7] = gamma * (obs - nl) + (1 - gamma) * season;
            l = nl;
          }
          if (!best || sse < best.sse) best = { sse, l, b, s: [...s], phi };
        }

  const { l, b, s, phi } = best!;
  const expected: number[] = [];
  let damp = 0;
  for (let h = 1; h <= horizon; h++) {
    damp += phi ** h;
    expected.push(round(Math.max(0, l + damp * b + s[(n - 1 + h) % 7])));
  }
  return { expected };
};

export const MODELS: Record<ModelId, Model> = {
  gestock: gestockModel,
  naive: naiveModel,
  'seasonal-naive': seasonalNaiveModel,
  'holt-winters': holtWintersModel,
};
export const BASELINES: ModelId[] = ['naive', 'seasonal-naive'];

// ---------- Métricas ----------

export interface Metrics {
  /** Quantidade de pares (previsto, real) avaliados. */
  n: number;
  /** MAE = média de |real − previsto| (na unidade da série). */
  mae: number | null;
  /** RMSE = √(média de (real − previsto)²) — penaliza mais os erros grandes. */
  rmse: number | null;
  /** WAPE = Σ|real − previsto| ÷ Σ|real|. null quando Σ|real| = 0 (indefinido). */
  wape: number | null;
  /** Viés = média de (previsto − real): > 0 superestima, < 0 subestima. */
  bias: number | null;
}

export function computeMetrics(actual: number[], predicted: number[]): Metrics {
  return metricsFromSums(sumsOf(actual, predicted));
}

// ---------- Backtesting ----------

export interface HorizonResult {
  horizon: number;
  /** Origens (datas de corte) avaliadas neste horizonte. */
  origins: number;
  /** Erro dia a dia (cada dia previsto × real). */
  daily: Metrics;
  /** Erro do TOTAL previsto para os H dias (o que importa para a compra). */
  total: Metrics;
  /** Fração dos dias reais dentro da faixa do modelo (só modelos com faixa). */
  dailyCoverage: number | null;
  /** Fração dos totais reais dentro da faixa do total (σ·√H). */
  totalCoverage: number | null;
  /**
   * Cobertura da faixa CALIBRADA (σ = maior entre o do modelo e o erro já medido até a data
   * simulada — só erros conhecidos naquele dia, sem vazamento). É a faixa mostrada na tela.
   */
  calibratedDailyCoverage: number | null;
  calibratedTotalCoverage: number | null;
  /** Somas brutas do erro diário (para agregar várias séries sem distorcer a WAPE). */
  sums: ErrorSums;
}

export interface ErrorSums {
  n: number;
  absError: number;
  sqError: number;
  error: number;
  absActual: number;
}

function sumsOf(actual: number[], predicted: number[]): ErrorSums {
  const s: ErrorSums = { n: 0, absError: 0, sqError: 0, error: 0, absActual: 0 };
  for (let i = 0; i < Math.min(actual.length, predicted.length); i++) {
    const e = predicted[i] - actual[i];
    s.n++;
    s.absError += Math.abs(e);
    s.sqError += e * e;
    s.error += e;
    s.absActual += Math.abs(actual[i]);
  }
  return s;
}

function metricsFromSums(s: ErrorSums): Metrics {
  if (!s.n) return { n: 0, mae: null, rmse: null, wape: null, bias: null };
  return {
    n: s.n,
    mae: round(s.absError / s.n),
    rmse: round(Math.sqrt(s.sqError / s.n)),
    wape: s.absActual > 0 ? round(s.absError / s.absActual, 4) : null,
    bias: round(s.error / s.n),
  };
}

export interface BacktestResult {
  status: 'OK' | 'INSUFFICIENT';
  message: string;
  minTrain: number;
  step: number;
  /** Primeiro e último dia comparados com o real. */
  evaluatedFrom: string | null;
  evaluatedTo: string | null;
  models: Partial<Record<ModelId, HorizonResult[]>>;
  /**
   * Erro diário fora da amostra do Gestock (RMSE, dias 1–7 de todas as simulações) para calibrar
   * a faixa da previsão de hoje. null com menos de MIN_CALIBRATION_ERRORS erros.
   */
  calibration: {
    sigma: number | null;
    errors: number;
    /**
     * Fator de correlação dos erros: RMSE do erro da SOMA de 7 dias ÷ (σ·√7). 1 = erros diários
     * independentes; > 1 = erros que se repetem em dias seguidos (a faixa do total e a margem de
     * segurança precisam ser maiores). null com menos de MIN_TOTAL_ERRORS somas avaliadas.
     */
    totalFactor: number | null;
    totals: number;
  };
}

/** Somas de 7 dias necessárias para medir a correlação dos erros. */
export const MIN_TOTAL_ERRORS = 4;

/** Erros fora da amostra necessários para calibrar a faixa (≈ 2 semanas de dias avaliados). */
export const MIN_CALIBRATION_ERRORS = 14;
const CALIBRATION_LEADS = 7;

export interface BacktestOptions {
  horizons?: number[];
  /** Dias mínimos de treino na primeira origem (padrão: 28, ou 14 em séries curtas). */
  minTrain?: number;
  step?: number;
  models?: ModelId[];
}

/** Treino mínimo: 28 dias (4 semanas, o modelo já usa o dia da semana) ou 14 em séries curtas. */
export const defaultMinTrain = (n: number) => (n >= 42 ? 28 : 14);

export function backtest(series: DailyPoint[], opts: BacktestOptions = {}): BacktestResult {
  const horizons = [...new Set(opts.horizons ?? [7, 14, 30])].sort((a, b) => a - b);
  const ids = opts.models ?? (['gestock', ...BASELINES] as ModelId[]);
  const n = series.length;
  const minTrain = opts.minTrain ?? defaultMinTrain(n);
  const step = opts.step ?? 7;
  const maxH = horizons[horizons.length - 1];

  // Origem o = índice do último dia de treino. Precisa de pelo menos o menor horizonte depois.
  const origins: number[] = [];
  for (let o = minTrain - 1; o + horizons[0] <= n - 1; o += step) origins.push(o);

  // Previsões de cada modelo em cada origem (só o passado entra).
  const preds = new Map<number, Partial<Record<ModelId, ModelForecast | null>>>();
  for (const o of origins) {
    const train = series.slice(0, o + 1);
    const h = Math.min(maxH, n - 1 - o);
    const row: Partial<Record<ModelId, ModelForecast | null>> = {};
    for (const id of ids) row[id] = MODELS[id](train, h);
    preds.set(o, row);
  }

  // Calibração "online" da faixa do Gestock: em cada origem, σ = maior entre o do modelo e o
  // RMSE dos erros JÁ CONHECIDOS naquela data (previsões anteriores cujo dia real já passou).
  const known: { at: number; sq: number }[] = [];
  const knownTotals: { at: number; sq: number }[] = []; // erro da soma dos 7 dias
  const calibrated = new Map<number, number>(); // origem → σ calibrado
  const totalFactorAt = new Map<number, number>(); // origem → fator de correlação
  for (const o of origins) {
    const f = preds.get(o)?.gestock;
    if (!f || !f.high) continue;
    const past = known.filter((k) => k.at <= o);
    const model = Math.max(...f.high.map((hi, i) => hi - f.expected[i]));
    const rmse =
      past.length >= MIN_CALIBRATION_ERRORS
        ? Math.sqrt(past.reduce((a, k) => a + k.sq, 0) / past.length)
        : 0;
    const sigmaO = Math.max(model, rmse);
    calibrated.set(o, sigmaO);
    const pastTotals = knownTotals.filter((k) => k.at <= o);
    totalFactorAt.set(
      o,
      pastTotals.length >= MIN_TOTAL_ERRORS && sigmaO > 0
        ? Math.max(
            1,
            Math.sqrt(pastTotals.reduce((a, k) => a + k.sq, 0) / pastTotals.length) /
              (sigmaO * Math.sqrt(CALIBRATION_LEADS)),
          )
        : 1,
    );
    let sum = 0;
    let complete = f.expected.length >= CALIBRATION_LEADS;
    for (let h = 1; h <= Math.min(CALIBRATION_LEADS, f.expected.length); h++) {
      const actual = series[o + h]?.value;
      if (actual === null || actual === undefined) {
        complete = false;
        continue;
      }
      const e = actual - f.expected[h - 1];
      known.push({ at: o + h, sq: e ** 2 });
      sum += e;
    }
    if (complete) knownTotals.push({ at: o + CALIBRATION_LEADS, sq: sum ** 2 });
  }
  const calibrationSigma =
    known.length >= MIN_CALIBRATION_ERRORS
      ? Math.sqrt(known.reduce((a, k) => a + k.sq, 0) / known.length)
      : null;
  const totalRmse =
    knownTotals.length >= MIN_TOTAL_ERRORS
      ? Math.sqrt(knownTotals.reduce((a, k) => a + k.sq, 0) / knownTotals.length)
      : null;
  const calibration = {
    sigma: calibrationSigma === null ? null : round(calibrationSigma),
    errors: known.length,
    totalFactor:
      totalRmse !== null && calibrationSigma
        ? round(Math.max(1, totalRmse / (calibrationSigma * Math.sqrt(CALIBRATION_LEADS))), 3)
        : null,
    totals: knownTotals.length,
  };

  const models: Partial<Record<ModelId, HorizonResult[]>> = {};
  let evaluatedFrom: string | null = null;
  let evaluatedTo: string | null = null;

  for (const H of horizons) {
    // Origens válidas: H dias futuros disponíveis E todos os modelos previram (justiça).
    const valid = origins.filter((o) => o + H <= n - 1 && ids.every((id) => preds.get(o)![id]));
    for (const id of ids) {
      const da: number[] = [];
      const dp: number[] = [];
      const ta: number[] = [];
      const tp: number[] = [];
      let inBand = 0;
      let banded = 0;
      let totalIn = 0;
      let totalBanded = 0;
      let calIn = 0;
      let calTotalIn = 0;
      for (const o of valid) {
        const f = preds.get(o)![id]!;
        const calSigma = id === 'gestock' ? calibrated.get(o) : undefined;
        const calFactor = totalFactorAt.get(o) ?? 1;
        let sa = 0;
        let sp = 0;
        let count = 0;
        for (let h = 1; h <= H; h++) {
          const actual = series[o + h].value;
          if (actual === null) continue;
          const p = f.expected[h - 1];
          da.push(actual);
          dp.push(p);
          sa += actual;
          sp += p;
          count++;
          if (f.low && f.high) {
            banded++;
            if (actual >= f.low[h - 1] - 1e-9 && actual <= f.high[h - 1] + 1e-9) inBand++;
          }
          if (calSigma !== undefined && Math.abs(actual - p) <= calSigma + 1e-9) calIn++;
          const date = series[o + h].date;
          if (!evaluatedFrom || date < evaluatedFrom) evaluatedFrom = date;
          if (!evaluatedTo || date > evaluatedTo) evaluatedTo = date;
        }
        if (count === 0) continue;
        ta.push(sa);
        tp.push(sp);
        if (f.low && f.high) {
          // Faixa do total do modelo Gestock: Σ esperado ± σ·√H, com σ recuperado da faixa diária.
          const sigma = Math.max(...f.high.slice(0, H).map((hi, i) => hi - f.expected[i]));
          const band = sigma * Math.sqrt(count);
          totalBanded++;
          if (sa >= Math.max(0, sp - band) - 1e-9 && sa <= sp + band + 1e-9) totalIn++;
        }
        if (
          calSigma !== undefined &&
          Math.abs(sa - sp) <= calSigma * Math.sqrt(count) * calFactor + 1e-9
        )
          calTotalIn++;
      }
      (models[id] ??= []).push({
        horizon: H,
        origins: ta.length,
        daily: computeMetrics(da, dp),
        total: computeMetrics(ta, tp),
        dailyCoverage: banded ? round(inBand / banded, 3) : null,
        totalCoverage: totalBanded ? round(totalIn / totalBanded, 3) : null,
        calibratedDailyCoverage: id === 'gestock' && banded ? round(calIn / banded, 3) : null,
        calibratedTotalCoverage:
          id === 'gestock' && totalBanded ? round(calTotalIn / totalBanded, 3) : null,
        sums: sumsOf(da, dp),
      });
    }
  }

  const any = Object.values(models).some((rs) => rs!.some((r) => r.daily.n > 0));
  return {
    status: any ? 'OK' : 'INSUFFICIENT',
    message: any
      ? `Previsões simuladas a cada ${step} dias, usando só os dados anteriores a cada data.`
      : 'Histórico insuficiente para avaliar a precisão.',
    minTrain,
    step,
    evaluatedFrom,
    evaluatedTo,
    models,
    calibration,
  };
}

// ---------- Resumo para a tela ----------

export type AccuracyLabel = 'GOOD' | 'MODERATE' | 'POOR';
export type EvidenceLevel = 'SUFFICIENT' | 'LIMITED' | 'INSUFFICIENT';

export interface AccuracySummary {
  evidence: EvidenceLevel;
  /** Horizonte usado no resumo (o maior avaliado até o pedido). */
  horizon: number | null;
  origins: number;
  observations: number;
  gestock: Metrics | null;
  /** Melhor referência simples no mesmo período (menor MAE). */
  baseline: { model: ModelId; metrics: Metrics } | null;
  /** 1 − MAE_gestock ÷ MAE_referência: > 0 = Gestock erra menos que a referência. */
  skill: number | null;
  /** Classificação pela WAPE do Gestock (convenção da equipe, não garantia estatística). */
  label: AccuracyLabel | null;
  /** Fração dos dias reais que caíram dentro da faixa diária do Gestock. */
  dailyCoverage: number | null;
  message: string;
}

/** Abaixo disto, os números aparecem, mas como evidência LIMITADA. */
const MIN_OBSERVATIONS = 28;
const MIN_ORIGINS = 4;

export function labelForWape(wape: number | null): AccuracyLabel | null {
  if (wape === null) return null;
  return wape <= 0.25 ? 'GOOD' : wape <= 0.5 ? 'MODERATE' : 'POOR';
}

export function summarizeAccuracy(result: BacktestResult, horizon = 7): AccuracySummary {
  const none: AccuracySummary = {
    evidence: 'INSUFFICIENT',
    horizon: null,
    origins: 0,
    observations: 0,
    gestock: null,
    baseline: null,
    skill: null,
    label: null,
    dailyCoverage: null,
    message: 'Histórico insuficiente para avaliar a precisão.',
  };
  const g = result.models.gestock;
  if (!g) return none;
  const candidates = g.filter((r) => r.daily.n > 0 && r.horizon <= Math.max(horizon, 7));
  const pick = candidates[candidates.length - 1] ?? g.find((r) => r.daily.n > 0);
  if (!pick) return none;

  const baselines = BASELINES.map((id) => ({
    model: id,
    metrics: result.models[id]?.find((r) => r.horizon === pick.horizon)?.daily,
  })).filter((b): b is { model: ModelId; metrics: Metrics } => !!b.metrics && b.metrics.n > 0);
  const baseline = baselines.sort((a, b) => (a.metrics.mae ?? 0) - (b.metrics.mae ?? 0))[0] ?? null;
  const skill =
    baseline && baseline.metrics.mae && pick.daily.mae !== null
      ? round(1 - pick.daily.mae / baseline.metrics.mae, 3)
      : null;

  const evidence: EvidenceLevel =
    pick.daily.n >= MIN_OBSERVATIONS && pick.origins >= MIN_ORIGINS ? 'SUFFICIENT' : 'LIMITED';
  const label = labelForWape(pick.daily.wape);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const parts = [
    pick.daily.wape !== null
      ? `Em ${pick.origins} simulação(ões) no passado, o erro médio foi de ${pct(pick.daily.wape)} (WAPE, ${pick.horizon} dias).`
      : `Em ${pick.origins} simulação(ões) no passado, o erro médio foi de ${pick.daily.mae} por dia (MAE).`,
  ];
  if (skill !== null && baseline) {
    parts.push(
      skill > 0
        ? `Errou ${pct(skill)} menos que a referência simples.`
        : skill < 0
          ? `Errou ${pct(-skill)} MAIS que a referência simples: use com cautela.`
          : 'Erro igual ao da referência simples.',
    );
  }
  if (evidence === 'LIMITED') parts.push('Poucos dados avaliados: resultado preliminar.');

  return {
    evidence,
    horizon: pick.horizon,
    origins: pick.origins,
    observations: pick.daily.n,
    gestock: pick.daily,
    baseline,
    skill,
    label,
    // a faixa mostrada na tela é a calibrada: é a cobertura dela que interessa
    dailyCoverage: pick.calibratedDailyCoverage ?? pick.dailyCoverage,
    message: parts.join(' '),
  };
}

/** Agrega pares (real, previsto) de várias séries da MESMA unidade (nunca misture unidades). */
export function pooledMetrics(results: BacktestResult[], model: ModelId, horizon: number) {
  const total: ErrorSums = { n: 0, absError: 0, sqError: 0, error: 0, absActual: 0 };
  let origins = 0;
  let series = 0;
  for (const r of results) {
    const h = r.models[model]?.find((x) => x.horizon === horizon);
    if (!h || !h.sums.n) continue;
    total.n += h.sums.n;
    total.absError += h.sums.absError;
    total.sqError += h.sums.sqError;
    total.error += h.sums.error;
    total.absActual += h.sums.absActual;
    origins += h.origins;
    series++;
  }
  return { series, origins, metrics: metricsFromSums(total) };
}
