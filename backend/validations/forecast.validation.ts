import { z } from 'zod';

export const productForecastQuery = z
  .object({ horizonDays: z.coerce.number().int().min(1).max(30).default(7) })
  .strict();

export const reorderQuery = z
  .object({ coverageDays: z.coerce.number().int().min(1).max(60).default(7) })
  .strict();
