import { z } from 'zod';

export const uuid = z.string().uuid('Identificador inválido');

export const pagination = {
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
};

/** Aceita data ISO (2026-11-12 ou 2026-11-12T10:00:00Z). */
export const isoDate = z.coerce.date({ invalid_type_error: 'Data inválida' });

export const positive = z.number().positive('Deve ser maior que zero');
export const nonNegative = z.number().min(0, 'Não pode ser negativo');

export const isValidTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const timezone = z.string().refine(isValidTimezone, 'Fuso horário inválido');

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
