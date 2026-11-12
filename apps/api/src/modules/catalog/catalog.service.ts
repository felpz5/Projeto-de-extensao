import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryKind, Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { AuthContext } from '../../common/auth-context';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { stockLevels, ZERO } from '../inventory/stock-levels';
import {
  CreateCategoryInput,
  CreateIngredientInput,
  CreateProductInput,
  ListIngredientsQuery,
  ListProductsQuery,
  SetRecipeInput,
  SetWeightMixInput,
  UpdateCategoryInput,
  UpdateIngredientInput,
  UpdateProductInput,
} from './catalog.schemas';

const ingredientRef = { select: { id: true, name: true, baseUnit: true } } as const;

@Injectable()
export class CatalogService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Categorias ----------

  listCategories(auth: AuthContext, kind?: CategoryKind) {
    return this.db.withContext(auth, (tx) =>
      tx.category.findMany({
        where: { tenantId: auth.tenantId, kind },
        orderBy: { name: 'asc' },
      }),
    );
  }

  createCategory(auth: AuthContext, input: CreateCategoryInput) {
    return this.db.withContext(auth, (tx) =>
      tx.category.create({ data: { ...input, tenantId: auth.tenantId } }),
    );
  }

  updateCategory(auth: AuthContext, id: string, input: UpdateCategoryInput) {
    return this.db.withContext(auth, async (tx) => {
      await this.findOrFail(tx.category.findFirst({ where: { id, tenantId: auth.tenantId } }));
      return tx.category.update({ where: { id }, data: input });
    });
  }

  deleteCategory(auth: AuthContext, id: string) {
    return this.db.withContext(auth, async (tx) => {
      await this.findOrFail(tx.category.findFirst({ where: { id, tenantId: auth.tenantId } }));
      await tx.category.delete({ where: { id } }); // itens ficam sem categoria (SET NULL)
    });
  }

  // ---------- Ingredientes ----------

  listIngredients(auth: AuthContext, q: ListIngredientsQuery) {
    return this.db.withContext(auth, async (tx) => {
      const items = await tx.ingredient.findMany({
        where: {
          tenantId: auth.tenantId,
          active: q.active,
          categoryId: q.categoryId,
          name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
        },
        include: { category: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      });
      const levels = await stockLevels(tx, auth.tenantId);
      return items.map((i) => {
        const stock = levels.get(i.id) ?? ZERO;
        return { ...i, stock, isLowStock: i.minStock.gt(0) && stock.lte(i.minStock) };
      });
    });
  }

  getIngredient(auth: AuthContext, id: string) {
    return this.db.withContext(auth, async (tx) => {
      const ingredient = await this.findOrFail(
        tx.ingredient.findFirst({
          where: { id, tenantId: auth.tenantId },
          include: { category: { select: { id: true, name: true } } },
        }),
      );
      const stock = (await stockLevels(tx, auth.tenantId, [id])).get(id) ?? ZERO;
      return {
        ...ingredient,
        stock,
        isLowStock: ingredient.minStock.gt(0) && stock.lte(ingredient.minStock),
      };
    });
  }

  createIngredient(auth: AuthContext, input: CreateIngredientInput) {
    return this.db.withContext(auth, async (tx) => {
      await this.ensureCategory(tx, auth.tenantId, input.categoryId, 'INGREDIENT');
      return tx.ingredient.create({ data: { ...input, tenantId: auth.tenantId } });
    });
  }

  updateIngredient(auth: AuthContext, id: string, input: UpdateIngredientInput) {
    return this.db.withContext(auth, async (tx) => {
      await this.findOrFail(tx.ingredient.findFirst({ where: { id, tenantId: auth.tenantId } }));
      await this.ensureCategory(tx, auth.tenantId, input.categoryId, 'INGREDIENT');
      return tx.ingredient.update({ where: { id }, data: input });
    });
  }

  /** Ingrediente com histórico não é apagado (perderia rastreabilidade): é desativado. */
  deleteIngredient(auth: AuthContext, id: string) {
    return this.db.withContext(auth, async (tx) => {
      await this.findOrFail(tx.ingredient.findFirst({ where: { id, tenantId: auth.tenantId } }));
      const [movements, recipes, mixes, sales] = await Promise.all([
        tx.stockMovement.count({ where: { ingredientId: id } }),
        tx.recipeItem.count({ where: { ingredientId: id } }),
        tx.weightMixItem.count({ where: { ingredientId: id } }),
        tx.saleItemIngredient.count({ where: { ingredientId: id } }),
      ]);
      if (movements + recipes + mixes + sales > 0) {
        await tx.ingredient.update({ where: { id }, data: { active: false } });
        await this.audit.log(tx, auth, 'ingredient.deactivate', 'ingredient', id);
        return { deleted: false, deactivated: true };
      }
      await tx.ingredient.delete({ where: { id } });
      await this.audit.log(tx, auth, 'ingredient.delete', 'ingredient', id);
      return { deleted: true, deactivated: false };
    });
  }

  // ---------- Produtos ----------

  listProducts(auth: AuthContext, q: ListProductsQuery) {
    return this.db.withContext(auth, (tx) =>
      tx.product.findMany({
        where: {
          tenantId: auth.tenantId,
          active: q.active,
          categoryId: q.categoryId,
          name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
        },
        include: {
          category: { select: { id: true, name: true } },
          _count: { select: { recipeItems: true, weightMix: true } },
        },
        orderBy: { name: 'asc' },
      }),
    );
  }

  getProduct(auth: AuthContext, id: string) {
    return this.db.withContext(auth, (tx) => this.loadProduct(tx, auth.tenantId, id));
  }

  createProduct(auth: AuthContext, input: CreateProductInput) {
    return this.db.withContext(auth, async (tx) => {
      await this.ensureCategory(tx, auth.tenantId, input.categoryId, 'PRODUCT');
      return tx.product.create({ data: { ...input, tenantId: auth.tenantId } });
    });
  }

  updateProduct(auth: AuthContext, id: string, input: UpdateProductInput) {
    return this.db.withContext(auth, async (tx) => {
      await this.findOrFail(tx.product.findFirst({ where: { id, tenantId: auth.tenantId } }));
      await this.ensureCategory(tx, auth.tenantId, input.categoryId, 'PRODUCT');
      return tx.product.update({ where: { id }, data: input });
    });
  }

  deleteProduct(auth: AuthContext, id: string) {
    return this.db.withContext(auth, async (tx) => {
      await this.findOrFail(tx.product.findFirst({ where: { id, tenantId: auth.tenantId } }));
      if ((await tx.saleItem.count({ where: { productId: id } })) > 0) {
        await tx.product.update({ where: { id }, data: { active: false } });
        await this.audit.log(tx, auth, 'product.deactivate', 'product', id);
        return { deleted: false, deactivated: true };
      }
      await tx.product.delete({ where: { id } });
      await this.audit.log(tx, auth, 'product.delete', 'product', id);
      return { deleted: true, deactivated: false };
    });
  }

  setRecipe(auth: AuthContext, productId: string, input: SetRecipeInput) {
    return this.db.withContext(auth, async (tx) => {
      const product = await this.findOrFail(
        tx.product.findFirst({ where: { id: productId, tenantId: auth.tenantId } }),
      );
      if (product.pricingMode !== 'UNIT') {
        throw new BadRequestException(
          'Receita fixa é só para produtos por unidade. Para produtos por peso use a composição média.',
        );
      }
      await this.ensureIngredients(tx, auth.tenantId, input.items.map((i) => i.ingredientId));

      await tx.recipeItem.deleteMany({ where: { productId } });
      await tx.recipeItem.createMany({
        data: input.items.map((i) => ({ ...i, productId, tenantId: auth.tenantId })),
      });
      await this.audit.log(tx, auth, 'product.recipe.set', 'product', productId, input);
      return this.loadProduct(tx, auth.tenantId, productId);
    });
  }

  setWeightMix(auth: AuthContext, productId: string, input: SetWeightMixInput) {
    return this.db.withContext(auth, async (tx) => {
      const product = await this.findOrFail(
        tx.product.findFirst({ where: { id: productId, tenantId: auth.tenantId } }),
      );
      if (product.pricingMode !== 'WEIGHT') {
        throw new BadRequestException('Composição média é só para produtos vendidos por peso');
      }
      const ingredients = await this.ensureIngredients(
        tx,
        auth.tenantId,
        input.items.map((i) => i.ingredientId),
      );
      const notGrams = ingredients.filter((i) => i.baseUnit !== 'G');
      if (notGrams.length) {
        throw new BadRequestException(
          `Na composição por peso todos os ingredientes devem ser medidos em gramas: ${notGrams
            .map((i) => i.name)
            .join(', ')}`,
        );
      }

      await tx.weightMixItem.deleteMany({ where: { productId } });
      await tx.weightMixItem.createMany({
        data: input.items.map((i) => ({ ...i, productId, tenantId: auth.tenantId })),
      });
      await this.audit.log(tx, auth, 'product.weightMix.set', 'product', productId, input);
      return this.loadProduct(tx, auth.tenantId, productId);
    });
  }

  // ---------- Auxiliares ----------

  private loadProduct(tx: Tx, tenantId: string, id: string) {
    return this.findOrFail(
      tx.product.findFirst({
        where: { id, tenantId },
        include: {
          category: { select: { id: true, name: true } },
          recipeItems: { include: { ingredient: ingredientRef } },
          weightMix: { include: { ingredient: ingredientRef } },
        },
      }),
    );
  }

  /** Garante que todos os ingredientes existem NESTE estabelecimento (FK sozinha não garante). */
  private async ensureIngredients(tx: Tx, tenantId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const found = await tx.ingredient.findMany({ where: { tenantId, id: { in: ids } } });
    if (found.length !== new Set(ids).size) {
      throw new BadRequestException('Um ou mais ingredientes não existem');
    }
    return found;
  }

  private async ensureCategory(
    tx: Tx,
    tenantId: string,
    categoryId: string | null | undefined,
    kind: CategoryKind,
  ) {
    if (!categoryId) return;
    const category = await tx.category.findFirst({ where: { id: categoryId, tenantId, kind } });
    if (!category) throw new BadRequestException('Categoria inválida');
  }

  private async findOrFail<T>(promise: Prisma.PrismaPromise<T | null> | Promise<T | null>) {
    const item = await promise;
    if (!item) throw new NotFoundException('Registro não encontrado');
    return item;
  }
}
