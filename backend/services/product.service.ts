import { withContext, type Tx } from '@/config/database';
import { productRepository, type ProductRepository } from '@/repositories/product.repository';
import { auditService, type AuditService } from '@/services/audit.service';
import { categoryService, type CategoryService } from '@/services/category.service';
import { ingredientService, type IngredientService } from '@/services/ingredient.service';
import type { AuthContext } from '@/types/auth.types';
import type {
  CreateProductDTO,
  ListProductsQuery,
  SetRecipeDTO,
  SetWeightMixDTO,
  UpdateProductDTO,
} from '@/types/product.types';
import { productCosting } from '@/services/product-costing';
import { AppError } from '@/utils/app-error';
import { canSeeCosts, withoutCost } from '@/utils/visibility';

export class ProductService {
  constructor(
    private readonly repository: ProductRepository,
    private readonly categories: CategoryService,
    private readonly ingredients: IngredientService,
    private readonly audit: AuditService,
  ) {}

  /** Lista com custo e margem (dono/gerente). Funcionário recebe só preço e composição. */
  list(auth: AuthContext, q: ListProductsQuery) {
    return withContext(auth, async (tx) => {
      const products = await this.repository.list(tx, auth.tenantId, q);
      return products.map(({ recipeItems, weightMix, ...p }) => ({
        ...p,
        costing: canSeeCosts(auth.role) ? productCosting({ ...p, recipeItems, weightMix }) : null,
      }));
    });
  }

  getById(auth: AuthContext, id: string) {
    return withContext(auth, async (tx) =>
      this.withCosting(auth, await this.loadFull(tx, auth.tenantId, id)),
    );
  }

  /** Custo e margem para dono/gerente; para o funcionário, sem custo de ingrediente. */
  private withCosting(auth: AuthContext, product: Awaited<ReturnType<ProductService['loadFull']>>) {
    if (canSeeCosts(auth.role)) return { ...product, costing: productCosting(product) };
    return {
      ...product,
      recipeItems: product.recipeItems.map((r) => ({
        ...r,
        ingredient: withoutCost(auth.role, r.ingredient),
      })),
      weightMix: product.weightMix.map((m) => ({
        ...m,
        ingredient: withoutCost(auth.role, m.ingredient),
      })),
      costing: null,
    };
  }

  create(auth: AuthContext, input: CreateProductDTO) {
    return withContext(auth, async (tx) => {
      await this.categories.ensureExists(tx, auth.tenantId, input.categoryId, 'PRODUCT');
      return this.repository.create(tx, { ...input, tenantId: auth.tenantId });
    });
  }

  update(auth: AuthContext, id: string, input: UpdateProductDTO) {
    return withContext(auth, async (tx) => {
      await this.getOrFail(tx, auth.tenantId, id);
      await this.categories.ensureExists(tx, auth.tenantId, input.categoryId, 'PRODUCT');
      return this.repository.update(tx, id, input);
    });
  }

  /** Produto já vendido não é apagado: é desativado. */
  remove(auth: AuthContext, id: string) {
    return withContext(auth, async (tx) => {
      await this.getOrFail(tx, auth.tenantId, id);
      if ((await this.repository.countSaleItems(tx, id)) > 0) {
        await this.repository.update(tx, id, { active: false });
        await this.audit.log(tx, auth, 'product.deactivate', 'product', id);
        return { deleted: false, deactivated: true };
      }
      await this.repository.delete(tx, id);
      await this.audit.log(tx, auth, 'product.delete', 'product', id);
      return { deleted: true, deactivated: false };
    });
  }

  /** Receita fixa (só produtos por unidade). Substitui a receita atual. */
  setRecipe(auth: AuthContext, productId: string, input: SetRecipeDTO) {
    return withContext(auth, async (tx) => {
      const product = await this.getOrFail(tx, auth.tenantId, productId);
      if (product.pricingMode !== 'UNIT') {
        throw new AppError(
          'Receita fixa é só para produtos por unidade. Para produtos por peso use a composição média.',
          400,
        );
      }
      await this.ingredients.ensureAllExist(
        tx,
        auth.tenantId,
        input.items.map((i) => i.ingredientId),
      );

      await this.repository.replaceRecipe(tx, auth.tenantId, productId, input.items);
      await this.audit.log(tx, auth, 'product.recipe.set', 'product', productId, input);
      return this.withCosting(auth, await this.loadFull(tx, auth.tenantId, productId));
    });
  }

  /** Composição média (%) de produto vendido por peso. Ingredientes precisam estar em gramas. */
  setWeightMix(auth: AuthContext, productId: string, input: SetWeightMixDTO) {
    return withContext(auth, async (tx) => {
      const product = await this.getOrFail(tx, auth.tenantId, productId);
      if (product.pricingMode !== 'WEIGHT') {
        throw new AppError('Composição média é só para produtos vendidos por peso', 400);
      }
      const ingredients = await this.ingredients.ensureAllExist(
        tx,
        auth.tenantId,
        input.items.map((i) => i.ingredientId),
      );
      const notGrams = ingredients.filter((i) => i.baseUnit !== 'G');
      if (notGrams.length) {
        throw new AppError(
          `Na composição por peso todos os ingredientes devem ser medidos em gramas: ${notGrams
            .map((i) => i.name)
            .join(', ')}`,
          400,
        );
      }

      await this.repository.replaceWeightMix(tx, auth.tenantId, productId, input.items);
      await this.audit.log(tx, auth, 'product.weightMix.set', 'product', productId, input);
      return this.withCosting(auth, await this.loadFull(tx, auth.tenantId, productId));
    });
  }

  private async getOrFail(tx: Tx, tenantId: string, id: string) {
    const product = await this.repository.findById(tx, tenantId, id);
    if (!product) throw new AppError('Registro não encontrado', 404);
    return product;
  }

  private async loadFull(tx: Tx, tenantId: string, id: string) {
    const product = await this.repository.findWithComposition(tx, tenantId, id);
    if (!product) throw new AppError('Registro não encontrado', 404);
    return product;
  }
}

export const productService = new ProductService(
  productRepository,
  categoryService,
  ingredientService,
  auditService,
);
