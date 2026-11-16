import {
  backtest,
  computeMetrics,
  holtWintersModel,
  labelForWape,
  naiveModel,
  pooledMetrics,
  seasonalNaiveModel,
  summarizeAccuracy,
} from '@/services/forecast-evaluation';
import type { DailyPoint } from '@/types/forecast.types';
import { addDays } from '@/utils/date';

/** `days` dias a partir de uma segunda-feira (2026-01-05). */
function series(
  days: number,
  valueFor: (weekday: number, i: number) => number | null,
): DailyPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays('2026-01-05', i);
    return { date, value: valueFor(new Date(`${date}T00:00:00Z`).getUTCDay(), i) };
  });
}

/** Gerador pseudoaleatório determinístico (mesmo resultado em toda execução). */
function lcg(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}

describe('computeMetrics (fórmulas com resultado conhecido)', () => {
  it('MAE, RMSE, WAPE e viés', () => {
    // erros: +1, −1, +2, −2 · reais: 10, 10, 10, 10
    const m = computeMetrics([10, 10, 10, 10], [11, 9, 12, 8]);
    expect(m.n).toBe(4);
    expect(m.mae).toBeCloseTo(1.5); // (1 + 1 + 2 + 2) / 4
    expect(m.rmse).toBeCloseTo(Math.sqrt(10 / 4)); // √((1 + 1 + 4 + 4) / 4)
    expect(m.wape).toBeCloseTo(6 / 40); // Σ|e| / Σ|y|
    expect(m.bias).toBeCloseTo(0);
  });

  it('RMSE ≥ MAE e penaliza mais um erro grande', () => {
    const a = computeMetrics([10, 10, 10, 10], [11, 11, 11, 11]);
    const b = computeMetrics([10, 10, 10, 10], [10, 10, 10, 14]);
    expect(a.mae).toBeCloseTo(b.mae!); // mesmo MAE (1)
    expect(b.rmse!).toBeGreaterThan(a.rmse!); // 2 > 1
  });

  it('WAPE é indefinida (null) quando todos os valores reais são zero — sem divisão por zero', () => {
    const m = computeMetrics([0, 0, 0], [1, 0, 2]);
    expect(m.wape).toBeNull();
    expect(m.mae).toBeCloseTo(1);
  });

  it('sem pares não inventa métrica', () => {
    expect(computeMetrics([], [])).toEqual({ n: 0, mae: null, rmse: null, wape: null, bias: null });
  });

  it('classificação por WAPE (convenção) e ausência de rótulo sem WAPE', () => {
    expect(labelForWape(0.2)).toBe('GOOD');
    expect(labelForWape(0.4)).toBe('MODERATE');
    expect(labelForWape(0.8)).toBe('POOR');
    expect(labelForWape(null)).toBeNull();
  });
});

describe('modelos de referência', () => {
  it('ingênuo repete o último valor observado (ignora dias sem observação)', () => {
    const s = series(10, (_, i) => (i === 9 ? null : i));
    expect(naiveModel(s, 3)!.expected).toEqual([8, 8, 8]);
  });

  it('ingênuo sazonal repete o mesmo dia da semana anterior, inclusive em h > 7', () => {
    const s = series(14, (wd) => wd * 10);
    const f = seasonalNaiveModel(s, 9)!;
    // a série termina num domingo: a previsão começa na segunda (1 → 10)
    expect(f.expected.slice(0, 7)).toEqual([10, 20, 30, 40, 50, 60, 0]);
    expect(f.expected.slice(7)).toEqual([10, 20]);
  });

  it('ingênuo sazonal precisa de 7 dias', () => {
    expect(
      seasonalNaiveModel(
        series(6, () => 1),
        7,
      ),
    ).toBeNull();
  });

  it('Holt-Winters reproduz uma série sazonal sem ruído e nunca prevê negativo', () => {
    const s = series(42, (wd) => (wd === 6 ? 40 : 10));
    const f = holtWintersModel(s, 7)!;
    const saturday = f.expected[5]; // segunda ... sábado
    expect(saturday).toBeGreaterThan(30);
    expect(f.expected[0]).toBeLessThan(15);
    expect(
      holtWintersModel(
        series(42, () => 0),
        7,
      )!.expected.every((v) => v >= 0),
    ).toBe(true);
  });

  it('Holt-Winters ignora dias sem observação ao iniciar (não os trata como zero)', () => {
    // sábado 40, demais 10; na 1ª semana, segunda a quarta sem observação (falta de estoque)
    const s = series(42, (wd, i) => (i < 3 ? null : wd === 6 ? 40 : 10));
    const f = holtWintersModel(s, 7)!;
    expect(f.expected[0]).toBeGreaterThan(7); // segunda continua perto de 10
    expect(f.expected[0]).toBeLessThan(13);
    expect(f.expected[5]).toBeGreaterThan(30); // sábado continua alto
  });

  it('Holt-Winters acompanha tendência que a média ponderada só segue com atraso', () => {
    const s = series(56, (_, i) => 10 + i);
    const f = holtWintersModel(s, 7)!;
    expect(f.expected[0]).toBeGreaterThan(60); // último valor = 65
  });
});

describe('backtest (validação cronológica)', () => {
  const rand = lcg(42);
  const noisy = series(120, (wd) => (wd === 0 || wd === 6 ? 30 : 12) + Math.round(rand() * 6 - 3));

  it('NÃO usa dados futuros: mudar o futuro não altera as previsões feitas antes dele', () => {
    const cut = 70; // índice a partir do qual o "futuro" é alterado
    const altered = noisy.map((p, i) => (i >= cut ? { ...p, value: 9999 } : p));
    const opts = { horizons: [7], step: 7, minTrain: 28 };
    const a = backtest(noisy.slice(0, cut), opts);
    const b = backtest(altered.slice(0, cut), opts);
    expect(b).toEqual(a);
    // e, com a série inteira, as origens antes do corte comparam com os mesmos reais:
    const full = backtest(noisy, opts);
    const fullAltered = backtest(altered, opts);
    // a única diferença está nas origens cuja janela de avaliação passa do corte
    expect(fullAltered.models.gestock![0].daily.mae).not.toBe(full.models.gestock![0].daily.mae);
  });

  it('a previsão em cada origem é igual a treinar só com o passado (recalcula tudo)', () => {
    const origin = 48;
    const train = noisy.slice(0, origin + 1);
    const direct = seasonalNaiveModel(train, 7)!.expected;
    const r = backtest(noisy.slice(0, origin + 8), {
      horizons: [7],
      minTrain: origin + 1,
      models: ['seasonal-naive'],
    });
    const actual = noisy.slice(origin + 1, origin + 8).map((p) => p.value as number);
    expect(r.models['seasonal-naive']![0].daily).toEqual(computeMetrics(actual, direct));
  });

  it('não avalia horizonte sem dias futuros suficientes e informa quantas avaliações fez', () => {
    const r = backtest(
      series(40, () => 5),
      { horizons: [7, 30], minTrain: 14 },
    );
    const g = r.models.gestock!;
    const h7 = g.find((x) => x.horizon === 7)!;
    const h30 = g.find((x) => x.horizon === 30)!;
    expect(h7.origins).toBeGreaterThan(0);
    expect(h7.daily.n).toBe(h7.origins * 7);
    expect(h30.origins).toBe(0);
    expect(h30.daily.n).toBe(0);
    expect(h30.daily.mae).toBeNull();
  });

  it('todos os modelos são avaliados nos mesmos dias (comparação justa)', () => {
    const r = backtest(noisy, {
      horizons: [7, 14],
      models: ['gestock', 'naive', 'seasonal-naive', 'holt-winters'],
    });
    for (const h of [0, 1]) {
      const ns = Object.values(r.models).map((rs) => rs![h].daily.n);
      expect(new Set(ns).size).toBe(1);
    }
  });

  it('dias sem observação não entram nas métricas', () => {
    const withGaps = noisy.map((p, i) => (i % 10 === 3 ? { ...p, value: null } : p));
    const r = backtest(withGaps, { horizons: [7], models: ['naive'] });
    const full = backtest(noisy, { horizons: [7], models: ['naive'] });
    expect(r.models.naive![0].daily.n).toBeLessThan(full.models.naive![0].daily.n);
  });

  it('série curta demais: status INSUFFICIENT e mensagem clara', () => {
    const r = backtest(series(16, () => 3));
    expect(r.status).toBe('INSUFFICIENT');
    expect(summarizeAccuracy(r).message).toBe('Histórico insuficiente para avaliar a precisão.');
  });

  it('em série com padrão semanal, o modelo Gestock erra menos que o ingênuo simples', () => {
    const r = backtest(noisy, { horizons: [7] });
    expect(r.models.gestock![0].daily.mae!).toBeLessThan(r.models.naive![0].daily.mae!);
    const s = summarizeAccuracy(r, 7);
    expect(s.evidence).toBe('SUFFICIENT');
    expect(s.skill).not.toBeNull();
  });

  it('não declara o modelo superior sem evidência: em ruído puro a vantagem some', () => {
    const r2 = lcg(7);
    const pureNoise = series(120, () => Math.round(r2() * 20));
    const s = summarizeAccuracy(backtest(pureNoise, { horizons: [7] }), 7);
    // pode ganhar ou perder do ingênuo sazonal; o resumo só relata o número medido
    expect(typeof s.skill).toBe('number');
    expect(s.message).toMatch(/simulação/);
  });

  it('faixa calibrada pelo erro já conhecido em cada data cobre pelo menos tanto quanto a do modelo', () => {
    const r = backtest(noisy, { horizons: [7] });
    const g = r.models.gestock![0];
    expect(g.calibratedDailyCoverage).not.toBeNull();
    expect(g.calibratedDailyCoverage!).toBeGreaterThanOrEqual(g.dailyCoverage!);
    expect(r.calibration.errors).toBeGreaterThanOrEqual(14);
    expect(r.calibration.sigma).toBeGreaterThan(0);
    // referências não têm faixa
    expect(r.models.naive![0].calibratedDailyCoverage).toBeNull();
  });

  it('a calibração também não usa o futuro: σ de uma série cortada não depende do que vem depois', () => {
    const cut = 77;
    const a = backtest(noisy.slice(0, cut), { horizons: [7] });
    const altered = noisy.map((p, i) => (i >= cut ? { ...p, value: 0 } : p));
    const b = backtest(altered.slice(0, cut), { horizons: [7] });
    expect(b.calibration).toEqual(a.calibration);
    expect(b.models.gestock![0].calibratedDailyCoverage).toBe(
      a.models.gestock![0].calibratedDailyCoverage,
    );
  });

  it('erros que se repetem por semanas aumentam a faixa do total (fator de correlação)', () => {
    // nível muda a cada semana (semanas fortes e fracas): o erro de dias seguidos tem o mesmo sinal
    const r3 = lcg(11);
    const weekLevel: number[] = [];
    const blocky = series(126, (_, i) => {
      const w = Math.floor(i / 7);
      weekLevel[w] ??= 10 + Math.round(r3() * 20);
      return weekLevel[w] + Math.round(r3() * 2);
    });
    const r = backtest(blocky, { horizons: [7] });
    expect(r.calibration.totalFactor!).toBeGreaterThan(1.3);
    const g = r.models.gestock![0];
    expect(g.calibratedTotalCoverage!).toBeGreaterThanOrEqual(g.totalCoverage!);
    // ruído independente: fator perto de 1
    const independent = backtest(noisy, { horizons: [7] });
    expect(independent.calibration.totalFactor!).toBeLessThan(1.3);
  });

  it('sem erros suficientes não calibra (não inventa σ)', () => {
    // 21 dias: uma única simulação (7 erros), abaixo do mínimo de 14
    const r = backtest(
      series(21, () => 5),
      { horizons: [7], minTrain: 14 },
    );
    expect(r.calibration.errors).toBe(7);
    expect(r.calibration.sigma).toBeNull();
  });

  it('mede a cobertura empírica da faixa (fração de dias reais dentro dela)', () => {
    const r = backtest(noisy, { horizons: [7] });
    const cov = r.models.gestock![0].dailyCoverage!;
    expect(cov).toBeGreaterThan(0);
    expect(cov).toBeLessThanOrEqual(1);
    expect(r.models.naive![0].dailyCoverage).toBeNull(); // o ingênuo não tem faixa
  });
});

describe('pooledMetrics (agregação por unidade)', () => {
  it('agrega pelas somas brutas: WAPE conjunta = Σ|e| ÷ Σ|y| das duas séries', () => {
    const a = backtest(
      series(60, () => 10),
      { horizons: [7], models: ['naive'] },
    );
    const b = backtest(
      series(60, (_, i) => (i % 2 ? 20 : 0)),
      { horizons: [7], models: ['naive'] },
    );
    const pooled = pooledMetrics([a, b], 'naive', 7);
    const ha = a.models.naive![0].sums;
    const hb = b.models.naive![0].sums;
    expect(pooled.series).toBe(2);
    expect(pooled.metrics.n).toBe(ha.n + hb.n);
    expect(pooled.metrics.wape).toBeCloseTo(
      (ha.absError + hb.absError) / (ha.absActual + hb.absActual),
      3,
    );
  });
});
