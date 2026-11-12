import { BadRequestException } from '@nestjs/common';
import { PricingMode, Prisma, QuantitySource } from '@prisma/client';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

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
  unitPrice?: number;
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
  ingredients: { ingredientId: string; quantity: Prisma.Decimal | null; quantitySource: QuantitySource }[];
  /** O que vira baixa de estoque (exata ou estimada). */
  consumption: PlannedConsumption[];
}

/**
 * Decide preço e consumo de um item de venda. Regras (em ordem):
 * 1. Ingredientes informados (pedido online):
 *    - com quantidade → MEASURED (exato)
 *    - sem quantidade, com porção padrão → STANDARD_PORTION (estimado)
 *    - sem quantidade e sem porção → UNKNOWN (registra o uso, NÃO baixa estoque)
 * 2. Produto com receita fixa → RECIPE (exato).
 * 3. Produto por peso com composição média e peso conhecido → baixa ESTIMADA,
 *    sem registrar ingredientes na venda (não inventamos o que foi usado).
 * 4. Caso contrário: nenhuma baixa (o inventário físico corrige depois).
 */
export function planSaleItem(
  item: SaleItemInput,
  product: ProductInfo,
  ingredients: Map<string, IngredientInfo>,
  fallbackWeightG?: number,
): PlannedItem {
  const quantity = D(item.quantity);
  const weightG = item.weightG !== undefined ? D(item.weightG) : null;

  let unitPrice: Prisma.Decimal;
  if (item.unitPrice !== undefined) {
    unitPrice = D(item.unitPrice);
  } else if (product.pricingMode === 'UNIT') {
    unitPrice = product.price;
  } else if (weightG) {
    unitPrice = product.price.mul(weightG).div(1000).div(quantity).toDecimalPlaces(2);
  } else {
    throw new BadRequestException(
      `"${product.name}" é vendido por peso: informe o peso (weightG) ou o valor do item (unitPrice)`,
    );
  }

  const planned: PlannedItem = {
    productId: product.id,
    quantity,
    unitPrice,
    weightG,
    ingredients: [],
    consumption: [],
  };

  if (item.ingredients?.length) {
    for (const sel of item.ingredients) {
      const info = ingredients.get(sel.ingredientId);
      if (!info) throw new BadRequestException('Ingrediente informado não existe');

      if (sel.quantity !== undefined) {
        const q = D(sel.quantity);
        planned.ingredients.push({ ingredientId: sel.ingredientId, quantity: q, quantitySource: 'MEASURED' });
        planned.consumption.push({ ingredientId: sel.ingredientId, quantity: q, isEstimated: false, source: 'MEASURED' });
      } else if (info.defaultPortion) {
        const q = info.defaultPortion.mul(quantity);
        planned.ingredients.push({ ingredientId: sel.ingredientId, quantity: q, quantitySource: 'STANDARD_PORTION' });
        planned.consumption.push({ ingredientId: sel.ingredientId, quantity: q, isEstimated: true, source: 'STANDARD_PORTION' });
      } else {
        planned.ingredients.push({ ingredientId: sel.ingredientId, quantity: null, quantitySource: 'UNKNOWN' });
      }
    }
    return planned;
  }

  if (product.recipe.length) {
    for (const r of product.recipe) {
      const q = r.quantity.mul(quantity);
      planned.ingredients.push({ ingredientId: r.ingredientId, quantity: q, quantitySource: 'RECIPE' });
      planned.consumption.push({ ingredientId: r.ingredientId, quantity: q, isEstimated: false, source: 'RECIPE' });
    }
    return planned;
  }

  const weightForMix = weightG ?? (fallbackWeightG !== undefined ? D(fallbackWeightG) : null);
  if (product.pricingMode === 'WEIGHT' && product.weightMix.length && weightForMix?.gt(0)) {
    for (const m of product.weightMix) {
      planned.consumption.push({
        ingredientId: m.ingredientId,
        quantity: weightForMix.mul(m.percentage).div(100).toDecimalPlaces(3),
        isEstimated: true,
        source: 'WEIGHT_MIX',
      });
    }
  }
  return planned;
}

/** Junta o consumo de vários itens numa baixa por ingrediente (separando exato de estimado). */
export function mergeConsumption(items: PlannedItem[]): PlannedConsumption[] {
  const merged = new Map<string, PlannedConsumption>();
  for (const c of items.flatMap((i) => i.consumption)) {
    const key = `${c.ingredientId}:${c.isEstimated}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, quantity: prev.quantity.plus(c.quantity) } : { ...c });
  }
  return [...merged.values()].filter((c) => c.quantity.gt(0));
}
