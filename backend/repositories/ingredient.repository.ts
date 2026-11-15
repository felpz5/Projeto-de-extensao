import type { Prisma } from '@prisma/client';
import type { Tx } from '@/config/database';
import type { ListIngredientsQuery } from '@/types/ingredient.types';

const withCategory = { category: { select: { id: true, name: true } } } as const;

export class IngredientRepository {
  list(tx: Tx, tenantId: string, q: ListIngredientsQuery) {
    return tx.ingredient.findMany({
      where: {
        tenantId,
        active: q.active,
        categoryId: q.categoryId,
        name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
      },
      include: withCategory,
      orderBy: { name: 'asc' },
    });
  }

  listActive(tx: Tx, tenantId: string) {
    return tx.ingredient.findMany({
      where: { tenantId, active: true },
      include: withCategory,
      orderBy: { name: 'asc' },
    });
  }

  findById(tx: Tx, tenantId: string, id: string) {
    return tx.ingredient.findFirst({ where: { id, tenantId }, include: withCategory });
  }

  findManyByIds(tx: Tx, tenantId: string, ids: string[]) {
    return tx.ingredient.findMany({ where: { tenantId, id: { in: ids } } });
  }

  /** Só o necessário para calcular a baixa de uma venda. */
  findPortions(tx: Tx, tenantId: string, ids: string[]) {
    return tx.ingredient.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, name: true, active: true, defaultPortion: true },
    });
  }

  listForReorder(tx: Tx, tenantId: string) {
    return tx.ingredient.findMany({
      where: { tenantId, active: true },
      select: {
        id: true,
        name: true,
        baseUnit: true,
        minStock: true,
        leadTimeDays: true,
        costPerUnit: true,
      },
    });
  }

  create(tx: Tx, data: Prisma.IngredientUncheckedCreateInput) {
    return tx.ingredient.create({ data });
  }

  update(tx: Tx, id: string, data: Prisma.IngredientUncheckedUpdateInput) {
    return tx.ingredient.update({ where: { id }, data });
  }

  delete(tx: Tx, id: string) {
    return tx.ingredient.delete({ where: { id } });
  }

  /** Quantas vezes o ingrediente aparece em movimentações, receitas, composições e vendas. */
  async countUsages(tx: Tx, id: string): Promise<number> {
    const counts = await Promise.all([
      tx.stockMovement.count({ where: { ingredientId: id } }),
      tx.recipeItem.count({ where: { ingredientId: id } }),
      tx.weightMixItem.count({ where: { ingredientId: id } }),
      tx.saleItemIngredient.count({ where: { ingredientId: id } }),
    ]);
    return counts.reduce((a, b) => a + b, 0);
  }
}

export const ingredientRepository = new IngredientRepository();
