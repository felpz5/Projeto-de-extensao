import type { CategoryKind, Prisma } from '@prisma/client';
import type { Tx } from '@/config/database';

export class CategoryRepository {
  list(tx: Tx, tenantId: string, kind?: CategoryKind) {
    return tx.category.findMany({ where: { tenantId, kind }, orderBy: { name: 'asc' } });
  }

  findById(tx: Tx, tenantId: string, id: string, kind?: CategoryKind) {
    return tx.category.findFirst({ where: { id, tenantId, kind } });
  }

  create(tx: Tx, data: Prisma.CategoryUncheckedCreateInput) {
    return tx.category.create({ data });
  }

  update(tx: Tx, id: string, data: Prisma.CategoryUpdateInput) {
    return tx.category.update({ where: { id }, data });
  }

  /** Itens da categoria ficam sem categoria (ON DELETE SET NULL). */
  delete(tx: Tx, id: string) {
    return tx.category.delete({ where: { id } });
  }
}

export const categoryRepository = new CategoryRepository();
