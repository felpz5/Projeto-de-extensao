import {
  buildDailySeries,
  correctConsumption,
  forecastDemand,
  recommendReorder,
  stockoutDays,
} from '@/services/forecast-engine';
import type { DailyPoint } from '@/types/forecast.types';
import { addDays } from '@/utils/date';

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

describe('correctConsumption', () => {
  const outflow = new Map([
    ['2026-01-01', 100],
    ['2026-01-02', 100],
  ]);

  it('ajuste positivo (estimativa exagerou) reduz o consumo, sem criar pico', () => {
    const c = correctConsumption(outflow, new Map([['2026-01-02', 50]]));
    expect([...c.values()]).toEqual([75, 75]);
  });

  it('ajuste negativo (consumiu mais que o registrado) aumenta o consumo', () => {
    const c = correctConsumption(outflow, new Map([['2026-01-02', -40]]));
    expect([...c.values()]).toEqual([120, 120]);
  });

  it('consumo nunca fica negativo', () => {
    const c = correctConsumption(outflow, new Map([['2026-01-02', 500]]));
    expect([...c.values()]).toEqual([0, 0]);
  });

  it('sem saídas registradas, os ajustes negativos viram o consumo do dia', () => {
    const c = correctConsumption(
      new Map(),
      new Map([
        ['2026-01-03', -30],
        ['2026-01-04', 10],
      ]),
    );
    expect([...c.entries()]).toEqual([['2026-01-03', 30]]);
  });
});

describe('forecastDemand', () => {
  it('recusa prever com menos de 7 dias de histórico', () => {
    const f = forecastDemand(
      series(5, () => 10),
      7,
    );
    expect(f.status).toBe('INSUFFICIENT_HISTORY');
    expect(f.total).toBeNull();
    expect(f.message).toContain('insuficiente');
  });

  it('série constante: previsão igual ao valor e sem incerteza', () => {
    const f = forecastDemand(
      series(14, () => 10),
      7,
    );
    expect(f.status).toBe('OK');
    expect(f.historyLevel).toBe('SHORT');
    expect(f.total?.expected).toBeCloseTo(70);
    expect(f.daily.every((d) => d.expected === 10 && d.low === 10 && d.high === 10)).toBe(true);
  });

  it('com 4+ semanas detecta que o fim de semana vende mais', () => {
    const f = forecastDemand(
      series(56, (wd) => (wd === 0 || wd === 6 ? 20 : 10)),
      7,
    );
    expect(f.method).toBe('weighted-moving-average+weekday');
    expect(f.historyLevel).toBe('WEEKLY');
    const saturday = f.daily.find((d) => d.weekday === 6)!;
    const tuesday = f.daily.find((d) => d.weekday === 2)!;
    expect(saturday.expected).toBeCloseTo(20, 0);
    expect(tuesday.expected).toBeCloseTo(10, 0);
  });

  it('dia em que a loja fecha (sempre zero) continua previsto como zero', () => {
    const f = forecastDemand(
      series(35, (wd) => (wd === 1 ? 0 : 12)),
      7,
    );
    expect(f.daily.find((d) => d.weekday === 1)!.expected).toBe(0);
  });

  it('não declara "confiança alta" só pela quantidade de dias (precisão vem do backtesting)', () => {
    const f = forecastDemand(
      series(100, (_, i) => 10 + (i % 2)),
      7,
    );
    expect(f).not.toHaveProperty('confidence');
    expect(f.historyLevel).toBe('WEEKLY');
  });

  it('dia sem observação (null) não conta como zero de demanda', () => {
    const s = series(21, () => 10).map((p, i) => (i % 5 === 0 ? { ...p, value: null } : p));
    const f = forecastDemand(s, 7);
    expect(f.observedDays).toBe(21 - 5);
    expect(f.total?.expected).toBeCloseTo(70);
  });

  it('falta de estoque longa não vira previsão zero (usa os últimos dias com dados)', () => {
    // 40 dias vendendo ~10, depois 30 dias sem estoque (sem observação)
    const s = series(70, () => 10).map((p, i) => (i >= 40 ? { ...p, value: null } : p));
    const f = forecastDemand(s, 7);
    expect(f.status).toBe('OK');
    expect(f.total?.expected).toBeCloseTo(70);
  });

  it('com menos de 7 dias OBSERVADOS não prevê, mesmo com mais dias corridos', () => {
    const s = series(12, () => 10).map((p, i) => (i < 6 ? { ...p, value: null } : p));
    const f = forecastDemand(s, 7);
    expect(f.status).toBe('INSUFFICIENT_HISTORY');
    expect(f.message).toMatch(/sem estoque/);
  });

  it('dia atípico é limitado (Hampel) e não puxa a previsão', () => {
    const base = series(28, (_, i) => 10 + (i % 3));
    const spike = base.map((p, i) => (i === 27 ? { ...p, value: 500 } : p));
    const normal = forecastDemand(base, 7);
    const robust = forecastDemand(spike, 7);
    expect(robust.outliersClipped).toBe(1);
    // sem o limite, o pico de 500 com peso 28/406 subiria o nível em ~34 unidades
    expect(robust.daily[0].expected - normal.daily[0].expected).toBeLessThan(2);
  });

  it('demanda intermitente informa a parcela de dias zerados', () => {
    const f = forecastDemand(
      series(28, (_, i) => (i % 4 === 0 ? 8 : 0)),
      7,
    );
    expect(f.zeroShare).toBeCloseTo(0.75, 2);
    expect(f.daily.every((d) => d.low >= 0)).toBe(true);
  });

  it('horizontes diferentes geram exatamente esse número de dias', () => {
    for (const h of [1, 7, 14, 30]) {
      expect(
        forecastDemand(
          series(35, () => 5),
          h,
        ).daily,
      ).toHaveLength(h);
    }
  });

  it('faixa calibrada: usa o erro medido quando ele é maior que o desvio do modelo', () => {
    const s = series(28, (_, i) => 10 + (i % 2));
    const plain = forecastDemand(s, 7);
    const wide = forecastDemand(s, 7, { minSigma: 5 });
    expect(wide.bandCalibrated).toBe(true);
    expect(wide.bandSigma).toBe(5);
    expect(wide.daily[0].high - wide.daily[0].expected).toBeCloseTo(5, 2);
    expect(wide.daily.map((d) => d.expected)).toEqual(plain.daily.map((d) => d.expected));
    // erro medido menor que o desvio do modelo: a faixa não encolhe
    const same = forecastDemand(s, 7, { minSigma: 0.01 });
    expect(same.bandCalibrated).toBe(false);
    expect(same.daily[0].high).toBe(plain.daily[0].high);
  });

  it('fator de correlação alarga só a faixa do TOTAL e a margem de segurança', () => {
    const s = series(28, (_, i) => 10 + (i % 3));
    const base = forecastDemand(s, 7, { minSigma: 2 });
    const corr = forecastDemand(s, 7, { minSigma: 2, totalFactor: 2 });
    expect(corr.daily).toEqual(base.daily); // faixa diária igual
    const width = (f: typeof base) => f.total!.high - f.total!.expected;
    expect(width(corr)).toBeCloseTo(2 * width(base), 2);
    const r = (f: typeof base) =>
      recommendReorder({ stock: 0, minStock: 0, leadTimeDays: 2, coverageDays: 5, forecast: f });
    expect(r(corr).safetyStock!).toBeCloseTo(2 * r(base).safetyStock!, 1);
  });

  it('limite inferior nunca é negativo', () => {
    const f = forecastDemand(
      series(14, (_, i) => (i % 3 === 0 ? 30 : 0)),
      7,
    );
    expect(f.daily.every((d) => d.low >= 0)).toBe(true);
    expect(f.total!.low).toBeGreaterThanOrEqual(0);
  });
});

describe('recommendReorder', () => {
  const steady = forecastDemand(
    series(30, () => 100),
    9,
  ); // 2 dias de entrega + 7 de cobertura

  it('sugere comprar o que falta para cobrir o período', () => {
    const r = recommendReorder({
      stock: 300,
      minStock: 0,
      leadTimeDays: 2,
      coverageDays: 7,
      forecast: steady,
    });
    expect(r.demandDuringCoverage).toBeCloseTo(900);
    expect(r.suggestedQuantity).toBeCloseTo(600);
    expect(r.daysUntilStockout).toBe(3);
    expect(r.urgency).toBe('BUY');
    expect(r.explanation).toMatch(/não elimina/);
  });

  it('margem de segurança usa o período de proteção completo: z·σ·√(L + R)', () => {
    const noisy = forecastDemand(
      series(30, (_, i) => (i % 2 ? 90 : 110)),
      9,
    );
    const r = recommendReorder({
      stock: 0,
      minStock: 0,
      leadTimeDays: 2,
      coverageDays: 7,
      forecast: noisy,
    });
    expect(r.safetyStock).toBeCloseTo(1.65 * noisy.stdDevDaily! * Math.sqrt(9), 1);
  });

  it('margem usa o erro medido fora da amostra quando ele é maior que o do modelo', () => {
    const r = recommendReorder({
      stock: 0,
      minStock: 0,
      leadTimeDays: 2,
      coverageDays: 7,
      forecast: steady,
      measuredErrorStd: 10,
    });
    expect(r.safetyStock).toBeCloseTo(1.65 * 10 * 3, 1);
  });

  it('dias até acabar seguem o padrão da semana, não só a média', () => {
    // domingo e sábado vendem 30, demais dias 10 (série começa numa segunda-feira)
    const f = forecastDemand(
      series(28, (wd) => (wd === 0 || wd === 6 ? 30 : 10)),
      7,
    );
    // a previsão começa numa segunda: 10 + 10 + 10 + 10 + 10 = 50 → acaba no fim do 5º dia
    const r = recommendReorder({
      stock: 50,
      minStock: 0,
      leadTimeDays: 1,
      coverageDays: 6,
      forecast: f,
    });
    expect(r.daysUntilStockout).toBeCloseTo(5, 0);
  });

  it('marca URGENTE quando acaba antes da entrega chegar', () => {
    const r = recommendReorder({
      stock: 150,
      minStock: 0,
      leadTimeDays: 2,
      coverageDays: 7,
      forecast: steady,
    });
    expect(r.urgency).toBe('URGENT');
  });

  it('não sugere compra quando o estoque cobre o período', () => {
    const r = recommendReorder({
      stock: 2000,
      minStock: 0,
      leadTimeDays: 2,
      coverageDays: 7,
      forecast: steady,
    });
    expect(r.suggestedQuantity).toBe(0);
    expect(r.urgency).toBe('OK');
  });

  it('sem histórico não inventa quantidade, mas avisa estoque baixo', () => {
    const none = forecastDemand(
      series(3, () => 1),
      9,
    );
    const r = recommendReorder({
      stock: 1,
      minStock: 5,
      leadTimeDays: 2,
      coverageDays: 7,
      forecast: none,
    });
    expect(r.urgency).toBe('LOW_STOCK_NO_HISTORY');
    expect(r.suggestedQuantity).toBeNull();
  });
});

describe('stockoutDays (dias sem estoque)', () => {
  const base = { start: '2026-01-01', end: '2026-01-05', first: '2026-01-01' };

  it('o dia em que o estoque inicial chega NÃO é dia sem estoque', () => {
    // começa em 0, recebe 100 no dia 1 e não vende nada nesse dia
    const days = stockoutDays({
      ...base,
      startBalance: 0,
      net: new Map([['2026-01-01', 100]]),
      outflow: new Map(),
    });
    expect([...days]).toEqual([]);
  });

  it('saldo zerado o dia inteiro e nenhuma saída = sem observação', () => {
    // 10 no início, consome 10 no dia 2, fica zerado nos dias 3 e 4, compra 50 no dia 5
    const days = stockoutDays({
      ...base,
      startBalance: 10,
      net: new Map([
        ['2026-01-02', -10],
        ['2026-01-05', 50],
      ]),
      outflow: new Map([['2026-01-02', 10]]),
    });
    expect([...days]).toEqual(['2026-01-03', '2026-01-04']);
  });

  it('dia com saída registrada nunca é sem observação (mesmo com saldo negativo estimado)', () => {
    const days = stockoutDays({
      ...base,
      startBalance: -5,
      net: new Map([['2026-01-01', -3]]),
      outflow: new Map([['2026-01-01', 3]]),
    });
    expect(days.has('2026-01-01')).toBe(false);
  });

  it('antes do primeiro movimento do ingrediente não marca nada', () => {
    const days = stockoutDays({
      ...base,
      first: '2026-01-04',
      startBalance: 0,
      net: new Map(),
      outflow: new Map(),
    });
    expect([...days]).toEqual(['2026-01-04', '2026-01-05']);
  });
});
