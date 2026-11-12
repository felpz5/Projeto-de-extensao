import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { AuthContext } from '../../common/auth-context';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { CreateMovementInput, InventoryCountInput, ListMovementsQuery } from './inventory.schemas';
import { stockLevels, ZERO } from './stock-levels';

export type StockStatus = 'OK' | 'LOW' | 'OUT';

const ingredientRef = { select: { id: true, name: true, baseUnit: true } } as const;

@Injectable()
export class InventoryService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  createMovement(auth: AuthContext, input: CreateMovementInput) {
    return this.db.withContext(auth, async (tx) => {
      const ingredient = await tx.ingredient.findFirst({
        where: { id: input.ingredientId, tenantId: auth.tenantId },
      });
      if (!ingredient) throw new NotFoundException('Ingrediente não encontrado');

      if (input.type === 'INITIAL') {
        const existing = await tx.stockMovement.count({ where: { ingredientId: ingredient.id } });
        if (existing > 0) {
          throw new BadRequestException(
            'Este ingrediente já tem movimentações. Use um ajuste ou a contagem de inventário.',
          );
        }
      }

      const isOut = input.type === 'MANUAL_OUT' || input.type === 'LOSS';
      const quantity = isOut ? -input.quantity : input.quantity;

      const movement = await tx.stockMovement.create({
        data: {
          tenantId: auth.tenantId,
          ingredientId: ingredient.id,
          type: input.type,
          quantity,
          unitCost: input.unitCost,
          occurredAt: input.occurredAt,
          note: input.note,
          createdById: auth.userId,
        },
        include: { ingredient: ingredientRef },
      });

      // A última compra atualiza o custo de referência do ingrediente.
      if (input.type === 'PURCHASE' && input.unitCost !== undefined) {
        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: { costPerUnit: input.unitCost },
        });
      }
      if (input.type === 'ADJUSTMENT' || input.type === 'LOSS') {
        await this.audit.log(tx, auth, `stock.${input.type.toLowerCase()}`, 'stock_movement', movement.id, {
          ingredientId: ingredient.id,
          quantity,
          note: input.note ?? null,
        });
      }

      const stock = (await stockLevels(tx, auth.tenantId, [ingredient.id])).get(ingredient.id) ?? ZERO;
      return {
        movement,
        stock,
        warning: stock.lt(0)
          ? 'O saldo ficou negativo. Confira as entradas ou faça uma contagem de inventário.'
          : undefined,
      };
    });
  }

  listMovements(auth: AuthContext, q: ListMovementsQuery) {
    const where: Prisma.StockMovementWhereInput = {
      tenantId: auth.tenantId,
      ingredientId: q.ingredientId,
      type: q.type,
      isEstimated: q.estimated,
      occurredAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
    };
    return this.db.withContext(auth, async (tx) => {
      const [items, total] = await Promise.all([
        tx.stockMovement.findMany({
          where,
          include: { ingredient: ingredientRef },
          orderBy: { occurredAt: 'desc' },
          take: q.take,
          skip: q.skip,
        }),
        tx.stockMovement.count({ where }),
      ]);
      return { items, total, take: q.take, skip: q.skip };
    });
  }

  /** Remove um lançamento manual digitado errado. Consumo de venda só sai excluindo a venda. */
  deleteMovement(auth: AuthContext, id: string) {
    return this.db.withContext(auth, async (tx) => {
      const movement = await tx.stockMovement.findFirst({ where: { id, tenantId: auth.tenantId } });
      if (!movement) throw new NotFoundException('Movimentação não encontrada');
      if (movement.saleId) {
        throw new BadRequestException('Este consumo veio de uma venda. Exclua a venda para desfazê-lo.');
      }
      await tx.stockMovement.delete({ where: { id } });
      await this.audit.log(tx, auth, 'stock.delete', 'stock_movement', id, {
        ingredientId: movement.ingredientId,
        type: movement.type,
        quantity: movement.quantity.toString(),
      });
    });
  }

  levels(auth: AuthContext) {
    return this.db.withContext(auth, (tx) => this.computeLevels(tx, auth.tenantId));
  }

  async lowStock(auth: AuthContext) {
    const levels = await this.levels(auth);
    return levels.filter((l) => l.status !== 'OK');
  }

  /** Usado também pelo dashboard. */
  async computeLevels(tx: Tx, tenantId: string) {
    const ingredients = await tx.ingredient.findMany({
      where: { tenantId, active: true },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    const levels = await stockLevels(tx, tenantId);
    return ingredients.map((i) => {
      const stock = levels.get(i.id) ?? ZERO;
      const status: StockStatus = stock.lte(0)
        ? 'OUT'
        : i.minStock.gt(0) && stock.lte(i.minStock)
          ? 'LOW'
          : 'OK';
      return {
        ingredientId: i.id,
        name: i.name,
        baseUnit: i.baseUnit,
        category: i.category,
        stock,
        minStock: i.minStock,
        status,
        stockValue: i.costPerUnit ? i.costPerUnit.mul(Prisma.Decimal.max(stock, 0)).toDecimalPlaces(2) : null,
      };
    });
  }

  count(auth: AuthContext, input: InventoryCountInput) {
    return this.db.withContext(auth, async (tx) => {
      const ids = input.items.map((i) => i.ingredientId);
      const found = await tx.ingredient.findMany({
        where: { tenantId: auth.tenantId, id: { in: ids } },
        select: { id: true, name: true },
      });
      if (found.length !== ids.length) throw new BadRequestException('Um ou mais ingredientes não existem');

      const levels = await stockLevels(tx, auth.tenantId, ids);
      const names = new Map(found.map((f) => [f.id, f.name]));
      const results = [];

      for (const item of input.items) {
        const previous = levels.get(item.ingredientId) ?? ZERO;
        const difference = new Prisma.Decimal(item.countedQuantity).minus(previous);
        if (!difference.isZero()) {
          await tx.stockMovement.create({
            data: {
              tenantId: auth.tenantId,
              ingredientId: item.ingredientId,
              type: 'ADJUSTMENT',
              quantity: difference,
              occurredAt: input.occurredAt,
              note: input.note ?? 'Contagem de inventário',
              createdById: auth.userId,
            },
          });
        }
        results.push({
          ingredientId: item.ingredientId,
          name: names.get(item.ingredientId),
          previous,
          counted: new Prisma.Decimal(item.countedQuantity),
          difference,
        });
      }

      await this.audit.log(tx, auth, 'stock.count', 'inventory', undefined, {
        items: results.map((r) => ({
          ingredientId: r.ingredientId,
          previous: r.previous.toString(),
          counted: r.counted.toString(),
        })),
      });
      return { adjusted: results.filter((r) => !r.difference.isZero()).length, items: results };
    });
  }
}
