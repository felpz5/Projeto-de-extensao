import { AppError } from '@/utils/app-error';

const DAY_MS = 24 * 60 * 60_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Data de hoje (YYYY-MM-DD) no fuso do estabelecimento. */
export function todayIn(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Soma dias a uma data YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Diferença (ms) entre o relógio do fuso `tz` e o UTC no instante `at`. */
function offsetMs(tz: string, at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)!.value);
  const wallClock = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return wallClock - (at - (at % 1000));
}

/** Instante (UTC) em que começa o dia `date` (YYYY-MM-DD) no fuso `tz`. */
export function startOfDayIn(date: string, tz: string): Date {
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  // Duas passadas: a segunda corrige o caso em que o fuso muda (horário de verão) perto da meia-noite.
  const first = midnightUtc - offsetMs(tz, midnightUtc);
  return new Date(midnightUtc - offsetMs(tz, first));
}

/**
 * Converte um filtro de data da query string em instante.
 * - Só o dia (2026-11-30): início do dia (`start`) ou último milissegundo do dia (`end`),
 *   no fuso do estabelecimento — assim `to=2026-11-30` inclui as vendas do dia 30.
 * - Data e hora com fuso (2026-11-30T15:00:00-03:00): usada como veio.
 */
export function parseDateFilter(
  value: string | undefined,
  tz: string,
  edge: 'start' | 'end',
): Date | undefined {
  if (!value) return undefined;
  if (!DATE_ONLY.test(value)) return new Date(value);
  if (edge === 'start') return startOfDayIn(value, tz);
  return new Date(startOfDayIn(addDays(value, 1), tz).getTime() - 1);
}

export interface Period {
  from: Date;
  to: Date;
}

/** Período de relatório no fuso do estabelecimento. Padrão: últimos `defaultDays` dias. */
export function resolvePeriod(
  q: { from?: string; to?: string },
  tz: string,
  defaultDays = 30,
): Period {
  const to = parseDateFilter(q.to, tz, 'end') ?? new Date();
  const from =
    parseDateFilter(q.from, tz, 'start') ?? new Date(to.getTime() - defaultDays * DAY_MS);
  if (from > to) throw new AppError('A data inicial deve ser anterior à final', 400);
  return { from, to };
}
