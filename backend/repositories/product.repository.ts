import type { Prisma } from '@prisma/client';
import type { Tx } from '@/config/database';
import type { ListProductsQuery } from '@/types/product.types';

const withCategory = { category: { select: { id: true, name: true } } } as const;
/** Com custo: para calcular custo e margem do produto (o service esconde do funcionário). */
const ingredientCost = {
  select: { id: true, name: true, baseUnit: true, costPerUnit: true },
} as const;

export class ProductRepository {
  list(tx: Tx, tenantId: string, q: ListProductsQuery) {
    return tx.product.findMany({
      where: {
        tenantId,
        active: q.active,
        categoryId: q.categoryId,
        name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
      },
      include: {
        ...withCategory,
        _count: { select: { recipeItems: true, weightMix: true } },
        recipeItems: { select: { quantity: true, ingredient: ingredientCost } },
        weightMix: { select: { percentage: true, ingredient: ingredientCost } },
      },
      orderBy: { name: 'asc' },
    });
  }

  findById(tx: Tx, tenantId: string, id: string) {
    return tx.product.findFirst({ where: { id, tenantId } });
  }

  /** Produto com categoria, receita e composição por peso. */
  findWithComposition(tx: Tx, tenantId: string, id: string) {
    return tx.product.findFirst({
      where: { id, tenantId },
      include: {
        ...withCategory,
        recipeItems: { include: { ingredient: ingredientCost } },
        weightMix: { include: { ingredient: ingredientCost } },
      },
    });
  }

  /** Produtos de uma venda, com o que é preciso para calcular a baixa de estoque. */
  findManyForSale(tx: Tx, tenantId: string, ids: string[]) {
    return tx.product.findMany({
      where: { tenantId, id: { in: ids } },
      include: { recipeItems: true, weightMix: true },
    });
  }

  create(tx: Tx, data: Prisma.ProductUncheckedCreateInput) {
    return tx.product.create({ data });
  }

  update(tx: Tx, id: string, data: Prisma.ProductUncheckedUpdateInput) {
    return tx.product.update({ where: { id }, data });
  }

  delete(tx: Tx, id: string) {
    return tx.product.delete({ where: { id } });
  }

  countSaleItems(tx: Tx, productId: string) {
    return tx.saleItem.count({ where: { productId } });
  }

  async replaceRecipe(
    tx: Tx,
    tenantId: string,
    productId: string,
    items: { ingredientId: string; quantity: number }[],
  ) {
    await tx.recipeItem.deleteMany({ where: { productId } });
    await tx.recipeItem.createMany({
      data: items.map((i) => ({ ...i, productId, tenantId })),
    });
  }

  async replaceWeightMix(
    tx: Tx,
    tenantId: string,
    productId: string,
    items: { ingredientId: string; percentage: number }[],
  ) {
    await tx.weightMixItem.deleteMany({ where: { productId } });
    await tx.weightMixItem.createMany({
      data: items.map((i) => ({ ...i, productId, tenantId })),
    });
  }
}

export const productRepository = new ProductRepository();
