/**
 * Ponto diário de uma série temporal.
 * `value: null` = dia SEM observação válida (ex.: ingrediente em falta no estoque: a demanda
 * daquele dia não foi observada). É diferente de 0, que significa "não vendeu/consumiu nada".
 */
export interface DailyPoint {
  date: string; // YYYY-MM-DD
  value: number | null;
}

/**
 * Quanto de histórico sustenta a previsão (qualidade dos DADOS, não precisão).
 * SHORT  = 7 a 27 dias: só nível (sem padrão por dia da semana)
 * WEEKLY = 28+ dias: nível + padrão por dia da semana
 */
export type HistoryLevel = 'SHORT' | 'WEEKLY';

export interface ForecastDay {
  date: string;
  weekday: number; // 0 = domingo
  expected: number;
  low: number;
  high: number;
}

export interface Forecast {
  status: 'OK' | 'INSUFFICIENT_HISTORY';
  /** Dias corridos da série (do primeiro registro até ontem). */
  historyDays: number;
  /** Dias com observação válida (exclui dias sem estoque). */
  observedDays: number;
  historyLevel: HistoryLevel | null;
  method: string | null;
  averageDaily: number | null;
  /** Desvio padrão dos resíduos dentro da janela de ajuste (incerteza diária do modelo). */
  stdDevDaily: number | null;
  /** Desvio usado na faixa (= stdDevDaily, ou o erro medido fora da amostra se for maior). */
  bandSigma: number | null;
  /** true quando a faixa foi alargada pelo erro medido no backtesting. */
  bandCalibrated: boolean;
  /** Fator de correlação aplicado à faixa do total e à margem de segurança (1 = sem ajuste). */
  totalFactor: number | null;
  /** Fator de cada dia da semana (0 = domingo); todos 1 quando não há sazonalidade. */
  weekdayFactors: number[] | null;
  /** Parcela de dias com valor zero na janela usada (sinal de demanda intermitente). */
  zeroShare: number | null;
  /** Dias atípicos limitados na estimativa do nível (não altera os dados gravados). */
  outliersClipped: number;
  total: { expected: number; low: number; high: number } | null;
  daily: ForecastDay[];
  message: string;
}

export type ReorderUrgency =
  | 'OUT_OF_STOCK'
  | 'URGENT'
  | 'BUY'
  | 'OK'
  | 'LOW_STOCK_NO_HISTORY'
  | 'NO_HISTORY';

export interface ReorderInput {
  stock: number;
  minStock: number;
  leadTimeDays: number;
  /** Intervalo até a próxima revisão/compra (R). Período de proteção = prazo + R. */
  coverageDays: number;
  /** Previsão calculada com horizonte = leadTimeDays + coverageDays. */
  forecast: Forecast;
  /**
   * Erro diário medido fora da amostra (RMSE do backtesting), quando existe. A margem de
   * segurança usa o MAIOR entre ele e o desvio do modelo (o desvio dentro da amostra tende a
   * subestimar o erro real).
   */
  measuredErrorStd?: number | null;
  /** 1,65 ≈ 95% de nível de serviço SE os erros fossem normais e independentes (aproximação). */
  serviceZ?: number;
  /** Unidade para o texto da explicação (ex.: "g"). */
  unit?: string;
}

export interface ReorderRecommendation {
  urgency: ReorderUrgency;
  suggestedQuantity: number | null;
  demandDuringCoverage: number | null;
  safetyStock: number | null;
  daysUntilStockout: number | null;
  explanation: string;
}

/** Linha das consultas de série diária (por produto ou ingrediente). */
export interface DailyRow {
  id: string;
  day: string;
  value: number;
}
