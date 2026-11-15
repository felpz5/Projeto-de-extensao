import { Prisma } from '@prisma/client';
import { withContext, type Tx } from '@/config/database';
import {
  ingredientRepository,
  type IngredientRepository,
} from '@/repositories/ingredient.repository';
import {
  stockMovementRepository,
  type StockMovementRepository,
} from '@/repositories/stock-movement.repository';
import { tenantRepository, type TenantRepository } from '@/repositories/tenant.repository';
import { auditService, type AuditService } from '@/services/audit.service';
import type { AuthContext } from '@/types/auth.types';
import type {
  CreateMovementDTO,
  InventoryCountDTO,
  ListMovementsQuery,
  ReverseMovementDTO,
} from '@/types/inventory.types';
import { AppError } from '@/utils/app-error';
import { parseDateFilter } from '@/utils/date';
import { ZERO } from '@/utils/decimal';
import { stockStatus } from '@/utils/stock';
import { STAFF_MOVEMENT_TYPES } from '@/validations/inventory.validation';

/**
 * Estoque como livro-razão: saldo = soma das movimentações.
 * Nunca se edita saldo nem se apaga lançamento: correções são novas movimentações
 * (ajuste, contagem ou estorno), e o histórico fica completo e auditável.
 */
export class InventoryService {
  constructor(
    private readonly movements: StockMovementRepository,
    private readonly ingredients: IngredientRepository,
    private readonly tenants: TenantRepository,
    private readonly audit: AuditService,
  ) {}

  createMovement(auth: AuthContext, input: CreateMovementDTO) {
    if (
      auth.role === 'STAFF' &&
      !(STAFF_MOVEMENT_TYPES as readonly string[]).includes(input.type)
    ) {
      throw new AppError(
        'Funcionários só lançam entradas. Saídas, perdas e ajustes ficam com gerente ou dono.',
        403,
      );
    }

    return withContext(auth, async (tx) => {
      const ingredient = await this.ingredients.findById(tx, auth.tenantId, input.ingredientId);
      if (!ingredient) throw new AppError('Ingrediente não encontrado', 404);

      if (
        input.type === 'INITIAL' &&
        (await this.movements.countEffectiveForIngredient(tx, ingredient.id)) > 0
      ) {
        throw new AppError(
          'Este ingrediente já tem movimentações. Use um ajuste ou a contagem de inventário.',
          400,
        );
      }

      const isOut = input.type === 'MANUAL_OUT' || input.type === 'LOSS';
      const quantity = isOut ? -input.quantity : input.quantity;

      const movement = await this.movements.create(tx, {
        tenantId: auth.tenantId,
        ingredientId: ingredient.id,
        type: input.type,
        quantity,
        unitCost: input.unitCost,
        occurredAt: input.occurredAt,
        note: input.note,
        createdById: auth.userId,
      });

      // A última compra atualiza o custo de referência do ingrediente.
      if (input.type === 'PURCHASE' && input.unitCost !== undefined) {
        await this.ingredients.update(tx, ingredient.id, { costPerUnit: input.unitCost });
      }
      if (input.type === 'ADJUSTMENT' || input.type === 'LOSS') {
        await this.audit.log(
          tx,
          auth,
          `stock.${input.type.toLowerCase()}`,
          'stock_movement',
          movement.id,
          { ingredientId: ingredient.id, quantity, note: input.note ?? null },
        );
      }

      return { movement, ...(await this.stockAfter(tx, auth.tenantId, ingredient.id)) };
    });
  }

  listMovements(auth: AuthContext, q: ListMovementsQuery) {
    return withContext(auth, async (tx) => {
      const tz = await this.tenants.findTimezone(tx, auth.tenantId);
      const from = parseDateFilter(q.from, tz, 'start');
      const to = parseDateFilter(q.to, tz, 'end');
      const where: Prisma.StockMovementWhereInput = {
        tenantId: auth.tenantId,
        ingredientId: q.ingredientId,
        type: q.type,
        isEstimated: q.estimated,
        occurredAt: from || to ? { gte: from, lte: to } : undefined,
      };
      const [items, total] = await Promise.all([
        this.movements.list(tx, where, q.take, q.skip),
        this.movements.count(tx, where),
      ]);
      return { items, total, take: q.take, skip: q.skip };
    });
  }

  /**
   * Estorna um lançamento manual digitado errado: cria a movimentação inversa na mesma data
   * e marca a original como estornada. Consumo de venda só sai excluindo a venda.
   */
  reverseMovement(auth: AuthContext, id: string, input: ReverseMovementDTO) {
    return withContext(auth, async (tx) => {
      const original = await this.movements.findById(tx, auth.tenantId, id);
      if (!original) throw new AppError('Movimentação não encontrada', 404);
      if (original.saleId) {
        throw new AppError('Este consumo veio de uma venda. Exclua a venda para desfazê-lo.', 400);
      }
      if (original.reversesId) throw new AppError('Um estorno não pode ser estornado', 400);
      if (!(await this.movements.markReversed(tx, original.id))) {
        throw new AppError('Esta movimentação já foi estornada', 409);
      }

      const reversal = await this.movements.create(tx, {
        tenantId: auth.tenantId,
        ingredientId: original.ingredientId,
        type: original.type,
        quantity: original.quantity.negated(),
        occurredAt: original.occurredAt,
        reversesId: original.id,
        note:
          input.note ??
          `Estorno do lançamento de ${original.occurredAt.toISOString().slice(0, 10)}`,
        createdById: auth.userId,
      });
      await this.audit.log(tx, auth, 'stock.reverse', 'stock_movement', original.id, {
        reversalId: reversal.id,
        ingredientId: original.ingredientId,
        type: original.type,
        quantity: original.quantity.toString(),
      });

      return { reversal, ...(await this.stockAfter(tx, auth.tenantId, original.ingredientId)) };
    });
  }

  levels(auth: AuthContext) {
    return withContext(auth, (tx) => this.computeLevels(tx, auth.tenantId));
  }

  async lowStock(auth: AuthContext) {
    const levels = await this.levels(auth);
    return levels.filter((l) => l.status !== 'OK');
  }

  /** Saldo e status de todos os ingredientes ativos. Usado também pelo dashboard. */
  async computeLevels(tx: Tx, tenantId: string) {
    const ingredients = await this.ingredients.listActive(tx, tenantId);
    const balances = await this.movements.balances(tx, tenantId);
    return ingredients.map((i) => {
      const stock = balances.get(i.id) ?? ZERO;
      return {
        ingredientId: i.id,
        name: i.name,
        baseUnit: i.baseUnit,
        category: i.category,
        stock,
        minStock: i.minStock,
        status: stockStatus(stock, i.minStock),
        stockValue: i.costPerUnit
          ? i.costPerUnit.mul(Prisma.Decimal.max(stock, 0)).toDecimalPlaces(2)
          : null,
      };
    });
  }

  /**
   * Contagem física: lança um ajuste com a diferença de cada item.
   * A diferença é calculada contra o saldo NO MOMENTO da contagem (`occurredAt`), então uma
   * contagem lançada depois (ex.: anotada ontem, digitada hoje) não conta duas vezes o que
   * aconteceu no meio tempo.
   */
  count(auth: AuthContext, input: InventoryCountDTO) {
    return withContext(auth, async (tx) => {
      const ids = input.items.map((i) => i.ingredientId);
      const found = await this.ingredients.findManyByIds(tx, auth.tenantId, ids);
      if (found.length !== ids.length)
        throw new AppError('Um ou mais ingredientes não existem', 400);

      // Sem data informada a contagem é "agora": usa o saldo completo (sem corte por relógio,
      // que poderia deixar de fora um lançamento gravado neste mesmo instante).
      const balances = await this.movements.balances(tx, auth.tenantId, ids, input.occurredAt);
      const countedAt = input.occurredAt ?? new Date();
      const names = new Map(found.map((f) => [f.id, f.name]));
      const results = [];

      for (const item of input.items) {
        const previous = balances.get(item.ingredientId) ?? ZERO;
        const counted = new Prisma.Decimal(item.countedQuantity);
        const difference = counted.minus(previous);
        if (!difference.isZero()) {
          await this.movements.create(tx, {
            tenantId: auth.tenantId,
            ingredientId: item.ingredientId,
            type: 'ADJUSTMENT',
            quantity: difference,
            occurredAt: input.occurredAt,
            note: input.note ?? 'Contagem de inventário',
            createdById: auth.userId,
          });
        }
        results.push({
          ingredientId: item.ingredientId,
          name: names.get(item.ingredientId),
          previous,
          counted,
          difference,
        });
      }

      await this.audit.log(tx, auth, 'stock.count', 'inventory', undefined, {
        countedAt: countedAt.toISOString(),
        items: results.map((r) => ({
          ingredientId: r.ingredientId,
          previous: r.previous.toString(),
          counted: r.counted.toString(),
        })),
      });
      return {
        countedAt,
        adjusted: results.filter((r) => !r.difference.isZero()).length,
        items: results,
      };
    });
  }

  /** Saldo atual do ingrediente + aviso se ficou negativo. */
  private async stockAfter(tx: Tx, tenantId: string, ingredientId: string) {
    const stock =
      (await this.movements.balances(tx, tenantId, [ingredientId])).get(ingredientId) ?? ZERO;
    return {
      stock,
      warning: stock.lt(0)
        ? 'O saldo ficou negativo. Confira as entradas ou faça uma contagem de inventário.'
        : undefined,
    };
  }
}

export const inventoryService = new InventoryService(
  stockMovementRepository,
  ingredientRepository,
  tenantRepository,
  auditService,
);
