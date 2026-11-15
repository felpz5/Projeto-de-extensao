import type { PricingMode, Prisma, QuantitySource } from '@prisma/client';
import type { z } from 'zod';
import type { periodQuery } from '@/validations/common.validation';
import type { cashQuery, createSaleSchema, listSalesQuery } from '@/validations/sale.validation';

export type CreateSaleDTO = z.infer<typeof createSaleSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuery>;
export type PeriodQuery = z.infer<typeof periodQuery>;
export type CashQuery = z.infer<typeof cashQuery>;

// ---------- Regras de consumo (services/sale-consumption.ts) ----------

export interface ProductInfo {
  id: string;
  name: string;
  pricingMode: PricingMode;
  price: Prisma.Decimal;
  recipe: { ingredientId: string; quantity: Prisma.Decimal }[];
  weightMix: { ingredientId: string; percentage: Prisma.Decimal }[];
}

export interface IngredientInfo {
  id: string;
  defaultPortion: Prisma.Decimal | null;
}

export interface SaleItemInput {
  productId: string;
  quantity: number;
  /** Valor de 1 unidade (número ou Decimal, para não perder precisão em divisões). */
  unitPrice?: Prisma.Decimal.Value;
  weightG?: number;
  /** Ingredientes escolhidos (pedido online). Quantidade só quando foi realmente medida. */
  ingredients?: { ingredientId: string; quantity?: number }[];
}

export interface PlannedConsumption {
  ingredientId: string;
  /** Quantidade consumida (positiva), na unidade base do ingrediente. */
  quantity: Prisma.Decimal;
  isEstimated: boolean;
  source: QuantitySource | 'WEIGHT_MIX';
}

export interface PlannedItem {
  productId: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  weightG: Prisma.Decimal | null;
  /** O que fica registrado na venda: só ingredientes informados ou da receita fixa. */
  ingredients: {
    ingredientId: string;
    quantity: Prisma.Decimal | null;
    quantitySource: QuantitySource;
  }[];
  /** O que vira baixa de estoque (exata ou estimada). */
  consumption: PlannedConsumption[];
}
