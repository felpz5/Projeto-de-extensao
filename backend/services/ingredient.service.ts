import { withContext, type Tx } from '@/config/database';
import {
  ingredientRepository,
  type IngredientRepository,
} from '@/repositories/ingredient.repository';
import {
  stockMovementRepository,
  type StockMovementRepository,
} from '@/repositories/stock-movement.repository';
import { auditService, type AuditService } from '@/services/audit.service';
import { categoryService, type CategoryService } from '@/services/category.service';
import type { AuthContext } from '@/types/auth.types';
import type {
  CreateIngredientDTO,
  ListIngredientsQuery,
  UpdateIngredientDTO,
} from '@/types/ingredient.types';
import { AppError } from '@/utils/app-error';
import { withoutCost } from '@/utils/visibility';
import { ZERO } from '@/utils/decimal';
import { stockStatus } from '@/utils/stock';

export class IngredientService {
  constructor(
    private readonly repository: IngredientRepository,
    private readonly movements: StockMovementRepository,
    private readonly categories: CategoryService,
    private readonly audit: AuditService,
  ) {}

  /** Lista com o saldo atual e o status (OK/LOW/OUT) de cada ingrediente. */
  list(auth: AuthContext, q: ListIngredientsQuery) {
    return withContext(auth, async (tx) => {
      const items = await this.repository.list(tx, auth.tenantId, q);
      const balances = await this.movements.balances(tx, auth.tenantId);
      return items.map((i) => {
        const stock = balances.get(i.id) ?? ZERO;
        const status = stockStatus(stock, i.minStock);
        return withoutCost(auth.role, { ...i, stock, status, isLowStock: status !== 'OK' });
      });
    });
  }

  getById(auth: AuthContext, id: string) {
    return withContext(auth, async (tx) => {
      const ingredient = await this.repository.findById(tx, auth.tenantId, id);
      if (!ingredient) throw new AppError('Registro não encontrado', 404);
      const stock = (await this.movements.balances(tx, auth.tenantId, [id])).get(id) ?? ZERO;
      const status = stockStatus(stock, ingredient.minStock);
      return withoutCost(auth.role, { ...ingredient, stock, status, isLowStock: status !== 'OK' });
    });
  }

  create(auth: AuthContext, input: CreateIngredientDTO) {
    return withContext(auth, async (tx) => {
      await this.categories.ensureExists(tx, auth.tenantId, input.categoryId, 'INGREDIENT');
      return this.repository.create(tx, { ...input, tenantId: auth.tenantId });
    });
  }

  update(auth: AuthContext, id: string, input: UpdateIngredientDTO) {
    return withContext(auth, async (tx) => {
      await this.getOrFail(tx, auth.tenantId, id);
      await this.categories.ensureExists(tx, auth.tenantId, input.categoryId, 'INGREDIENT');
      return this.repository.update(tx, id, input);
    });
  }

  /** Ingrediente com histórico não é apagado (perderia rastreabilidade): é desativado. */
  remove(auth: AuthContext, id: string) {
    return withContext(auth, async (tx) => {
      await this.getOrFail(tx, auth.tenantId, id);
      if ((await this.repository.countUsages(tx, id)) > 0) {
        await this.repository.update(tx, id, { active: false });
        await this.audit.log(tx, auth, 'ingredient.deactivate', 'ingredient', id);
        return { deleted: false, deactivated: true };
      }
      await this.repository.delete(tx, id);
      await this.audit.log(tx, auth, 'ingredient.delete', 'ingredient', id);
      return { deleted: true, deactivated: false };
    });
  }

  /**
   * Garante que todos os ingredientes existem NESTE estabelecimento (FK sozinha não garante)
   * e estão ativos (ingrediente desativado não entra em receita nova).
   */
  async ensureAllExist(tx: Tx, tenantId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const found = await this.repository.findManyByIds(tx, tenantId, ids);
    if (found.length !== new Set(ids).size) {
      throw new AppError('Um ou mais ingredientes não existem', 400);
    }
    const inactive = found.filter((i) => !i.active);
    if (inactive.length) {
      throw new AppError(`Ingrediente inativo: ${inactive.map((i) => i.name).join(', ')}`, 400);
    }
    return found;
  }

  private async getOrFail(tx: Tx, tenantId: string, id: string) {
    const ingredient = await this.repository.findById(tx, tenantId, id);
    if (!ingredient) throw new AppError('Registro não encontrado', 404);
    return ingredient;
  }
}

export const ingredientService = new IngredientService(
  ingredientRepository,
  stockMovementRepository,
  categoryService,
  auditService,
);
