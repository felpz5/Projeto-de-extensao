import { Prisma } from '@prisma/client';
import type {
  IngredientInfo,
  PlannedConsumption,
  PlannedItem,
  ProductInfo,
  SaleItemInput,
} from '@/types/sale.types';
import { AppError } from '@/utils/app-error';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * Decide preço e consumo de um item de venda. Regras (em ordem):
 * 1. Ingredientes informados (pedido online):
 *    - com quantidade → MEASURED (exato; é o total usado no item, não multiplica pela quantidade)
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
    throw new AppError(
      `"${product.name}" é vendido por peso: informe o peso (weightG) ou o valor do item (unitPrice)`,
      400,
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
      if (!info) throw new AppError('Ingrediente informado não existe', 400);

      if (sel.quantity !== undefined) {
        const q = D(sel.quantity);
        planned.ingredients.push({
          ingredientId: sel.ingredientId,
          quantity: q,
          quantitySource: 'MEASURED',
        });
        planned.consumption.push({
          ingredientId: sel.ingredientId,
          quantity: q,
          isEstimated: false,
          source: 'MEASURED',
        });
      } else if (info.defaultPortion) {
        const q = info.defaultPortion.mul(quantity);
        planned.ingredients.push({
          ingredientId: sel.ingredientId,
          quantity: q,
          quantitySource: 'STANDARD_PORTION',
        });
        planned.consumption.push({
          ingredientId: sel.ingredientId,
          quantity: q,
          isEstimated: true,
          source: 'STANDARD_PORTION',
        });
      } else {
        planned.ingredients.push({
          ingredientId: sel.ingredientId,
          quantity: null,
          quantitySource: 'UNKNOWN',
        });
      }
    }
    return planned;
  }

  if (product.recipe.length) {
    for (const r of product.recipe) {
      const q = r.quantity.mul(quantity);
      planned.ingredients.push({
        ingredientId: r.ingredientId,
        quantity: q,
        quantitySource: 'RECIPE',
      });
      planned.consumption.push({
        ingredientId: r.ingredientId,
        quantity: q,
        isEstimated: false,
        source: 'RECIPE',
      });
    }
    return planned;
  }

  if (product.pricingMode === 'WEIGHT' && product.weightMix.length && weightG?.gt(0)) {
    for (const m of product.weightMix) {
      planned.consumption.push({
        ingredientId: m.ingredientId,
        quantity: weightG.mul(m.percentage).div(100).toDecimalPlaces(3),
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
