import { Prisma, type PricingMode } from '@prisma/client';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

interface CostIngredient {
  name: string;
  costPerUnit: Prisma.Decimal | null;
}

export interface CostingInput {
  pricingMode: PricingMode;
  price: Prisma.Decimal;
  recipeItems: { quantity: Prisma.Decimal; ingredient: CostIngredient }[];
  weightMix: { percentage: Prisma.Decimal; ingredient: CostIngredient }[];
}

export interface ProductCosting {
  /** UNIT: custo de 1 unidade · KG: custo de 1 kg (produto vendido por peso). */
  basis: 'UNIT' | 'KG';
  /** null = sem receita/composição, não dá para calcular. */
  cost: Prisma.Decimal | null;
  margin: Prisma.Decimal | null;
  /** Margem sobre o preço (%), com 1 casa. */
  marginPct: number | null;
  /** Ingredientes da composição sem custo cadastrado (o custo fica subestimado). */
  missingCost: string[];
  /** Por peso: quanto do pote a composição cobre (%). O resto não entra no custo. */
  coveragePct: number | null;
  /** Custo calculado a partir de composição média (estimativa), não de receita exata. */
  estimated: boolean;
}

/**
 * Custo e margem de um produto a partir do custo atual dos ingredientes.
 * - Por unidade: Σ quantidade da receita × custo do ingrediente.
 * - Por peso: custo de 1 kg = Σ (percentual × 1000 g) × custo por grama.
 */
export function productCosting(p: CostingInput): ProductCosting {
  const isWeight = p.pricingMode === 'WEIGHT';
  const parts = isWeight
    ? p.weightMix.map((m) => ({
        amount: D(m.percentage).div(100).mul(1000),
        ingredient: m.ingredient,
      }))
    : p.recipeItems.map((r) => ({ amount: D(r.quantity), ingredient: r.ingredient }));

  const coveragePct = isWeight
    ? Math.round(p.weightMix.reduce((s, m) => s + Number(m.percentage), 0) * 10) / 10
    : null;

  if (!parts.length) {
    return {
      basis: isWeight ? 'KG' : 'UNIT',
      cost: null,
      margin: null,
      marginPct: null,
      missingCost: [],
      coveragePct,
      estimated: isWeight,
    };
  }

  let cost = D(0);
  const missingCost: string[] = [];
  for (const part of parts) {
    if (part.ingredient.costPerUnit === null) missingCost.push(part.ingredient.name);
    else cost = cost.plus(part.amount.mul(part.ingredient.costPerUnit));
  }
  cost = cost.toDecimalPlaces(2);
  const price = D(p.price);
  const margin = price.minus(cost);

  return {
    basis: isWeight ? 'KG' : 'UNIT',
    cost,
    margin,
    marginPct: price.isZero() ? null : Math.round(margin.div(price).mul(1000).toNumber()) / 10,
    missingCost,
    coveragePct,
    estimated: isWeight,
  };
}
