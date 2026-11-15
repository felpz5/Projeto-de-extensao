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

/** Linha das consultas de série diária (por produto ou ingrediente). */
export interface DailyRow {
  id: string;
  day: string;
  value: number;
}
