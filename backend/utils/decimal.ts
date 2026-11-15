import { Prisma } from '@prisma/client';

export const ZERO = new Prisma.Decimal(0);

export const toDecimal = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
