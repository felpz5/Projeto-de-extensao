import { parseDateFilter, resolvePeriod, startOfDayIn } from '@/utils/date';

describe('startOfDayIn', () => {
  it('São Paulo (UTC−3): o dia começa às 03:00 UTC', () => {
    expect(startOfDayIn('2026-11-01', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-11-01T03:00:00.000Z',
    );
  });

  it('respeita o horário de verão (Nova York, 08/03/2026)', () => {
    expect(startOfDayIn('2026-03-08', 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(startOfDayIn('2026-03-09', 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });
});

describe('parseDateFilter', () => {
  const tz = 'America/Sao_Paulo';

  it('"to" com só o dia inclui o dia inteiro', () => {
    expect(parseDateFilter('2026-11-30', tz, 'end')!.toISOString()).toBe(
      '2026-12-01T02:59:59.999Z',
    );
  });

  it('data e hora com fuso é usada como veio', () => {
    expect(parseDateFilter('2026-11-30T15:00:00-03:00', tz, 'start')!.toISOString()).toBe(
      '2026-11-30T18:00:00.000Z',
    );
  });

  it('sem valor devolve undefined', () => {
    expect(parseDateFilter(undefined, tz, 'start')).toBeUndefined();
  });
});

describe('resolvePeriod', () => {
  it('converte o período inteiro no fuso do estabelecimento', () => {
    const p = resolvePeriod({ from: '2026-11-01', to: '2026-11-30' }, 'America/Sao_Paulo');
    expect(p.from.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(p.to.toISOString()).toBe('2026-12-01T02:59:59.999Z');
  });

  it('recusa período invertido', () => {
    expect(() => resolvePeriod({ from: '2026-11-30', to: '2026-11-01' }, 'UTC')).toThrow();
  });
});
