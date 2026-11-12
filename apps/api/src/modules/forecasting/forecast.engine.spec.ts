import { addDays } from '../../common/schemas';
import { buildDailySeries, DailyPoint, forecastDemand, recommendReorder } from './forecast.engine';

/** Gera `days` dias a partir de uma segunda-feira (2026-01-05). */
function series(days: number, valueFor: (weekday: number, i: number) => number): DailyPoint[] {
  const start = '2026-01-05';
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return { date, value: valueFor(weekday, i) };
  });
}

describe('buildDailySeries', () => {
  it('preenche dias sem movimento com zero', () => {
    const s = buildDailySeries(new Map([['2026-01-02', 5]]), '2026-01-01', '2026-01-03');
    expect(s).toEqual([
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 5 },
      { date: '2026-01-03', value: 0 },
    ]);
  });
});

describe('forecastDemand', () => {
  it('recusa prever com menos de 7 dias de histórico', () => {
    const f = forecastDemand(series(5, () => 10), 7);
    expect(f.status).toBe('INSUFFICIENT_HISTORY');
    expect(f.total).toBeNull();
    expect(f.message).toContain('insuficiente');
  });

  it('série constante: previsão igual ao valor e sem incerteza', () => {
    const f = forecastDemand(series(14, () => 10), 7);
    expect(f.status).toBe('OK');
    expect(f.confidence).toBe('LOW');
    expect(f.total?.expected).toBeCloseTo(70);
    expect(f.daily.every((d) => d.expected === 10 && d.low === 10 && d.high === 10)).toBe(true);
  });

  it('com 4+ semanas detecta que o fim de semana vende mais', () => {
    const f = forecastDemand(series(56, (wd) => (wd === 0 || wd === 6 ? 20 : 10)), 7);
    expect(f.method).toBe('weighted-moving-average+weekday');
    expect(f.confidence).toBe('MEDIUM');
    const saturday = f.daily.find((d) => d.weekday === 6)!;
    const tuesday = f.daily.find((d) => d.weekday === 2)!;
    expect(saturday.expected).toBeCloseTo(20, 0);
    expect(tuesday.expected).toBeCloseTo(10, 0);
  });

  it('dia em que a loja fecha (sempre zero) continua previsto como zero', () => {
    const f = forecastDemand(series(35, (wd) => (wd === 1 ? 0 : 12)), 7);
    expect(f.daily.find((d) => d.weekday === 1)!.expected).toBe(0);
  });

  it('confiança alta exige 90+ dias e pouca variação', () => {
    const f = forecastDemand(series(100, (_, i) => 10 + (i % 2)), 7);
    expect(f.confidence).toBe('HIGH');
  });

  it('limite inferior nunca é negativo', () => {
    const f = forecastDemand(series(14, (_, i) => (i % 3 === 0 ? 30 : 0)), 7);
    expect(f.daily.every((d) => d.low >= 0)).toBe(true);
    expect(f.total!.low).toBeGreaterThanOrEqual(0);
  });
});

describe('recommendReorder', () => {
  const steady = forecastDemand(series(30, () => 100), 9); // 2 dias de entrega + 7 de cobertura

  it('sugere comprar o que falta para cobrir o período', () => {
    const r = recommendReorder({ stock: 300, minStock: 0, leadTimeDays: 2, coverageDays: 7, forecast: steady });
    expect(r.demandDuringCoverage).toBeCloseTo(900);
    expect(r.suggestedQuantity).toBeCloseTo(600);
    expect(r.daysUntilStockout).toBe(3);
    expect(r.urgency).toBe('BUY');
  });

  it('marca URGENTE quando acaba antes da entrega chegar', () => {
    const r = recommendReorder({ stock: 150, minStock: 0, leadTimeDays: 2, coverageDays: 7, forecast: steady });
    expect(r.urgency).toBe('URGENT');
  });

  it('não sugere compra quando o estoque cobre o período', () => {
    const r = recommendReorder({ stock: 2000, minStock: 0, leadTimeDays: 2, coverageDays: 7, forecast: steady });
    expect(r.suggestedQuantity).toBe(0);
    expect(r.urgency).toBe('OK');
  });

  it('sem histórico não inventa quantidade, mas avisa estoque baixo', () => {
    const none = forecastDemand(series(3, () => 1), 9);
    const r = recommendReorder({ stock: 1, minStock: 5, leadTimeDays: 2, coverageDays: 7, forecast: none });
    expect(r.urgency).toBe('LOW_STOCK_NO_HISTORY');
    expect(r.suggestedQuantity).toBeNull();
  });
});
