import { z } from 'zod';
import { uuid } from '@/validations/common.validation';

const horizonDays = z.coerce.number().int().min(1).max(30).default(7);
/** Quantos dias de histórico entram na análise (mais dias = mais simulações no backtesting). */
const lookbackDays = z.coerce.number().int().min(28).max(365).default(120);

export const productForecastQuery = z.object({ horizonDays }).strict();

export const productDetailParams = z.object({ id: uuid }).strict();
export const productDetailQuery = z.object({ horizonDays, lookbackDays }).strict();

export const accuracyQuery = z.object({ lookbackDays }).strict();

export const reorderQuery = z
  .object({ coverageDays: z.coerce.number().int().min(1).max(60).default(7) })
  .strict();
