import type { Request, Response } from 'express';
import { inventoryService } from '@/services/inventory.service';
import { uuid } from '@/validations/common.validation';
import {
  createMovementSchema,
  inventoryCountSchema,
  listMovementsQuery,
  reverseMovementSchema,
} from '@/validations/inventory.validation';

export class InventoryController {
  /** Saldo de todos os ingredientes ativos, com status OK / LOW / OUT. */
  async levels(req: Request, res: Response) {
    return res.json(await inventoryService.levels(req.user!));
  }

  async lowStock(req: Request, res: Response) {
    return res.json(await inventoryService.lowStock(req.user!));
  }

  async listMovements(req: Request, res: Response) {
    const query = listMovementsQuery.parse(req.query);
    return res.json(await inventoryService.listMovements(req.user!, query));
  }

  /** Funcionário lança só entradas (INITIAL/PURCHASE); o resto fica com gerente ou dono. */
  async createMovement(req: Request, res: Response) {
    const data = createMovementSchema.parse(req.body);
    return res.status(201).json(await inventoryService.createMovement(req.user!, data));
  }

  /** Estorna um lançamento digitado errado (cria a movimentação inversa; nada é apagado). */
  async reverseMovement(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    const data = reverseMovementSchema.parse(req.body ?? {});
    return res.status(201).json(await inventoryService.reverseMovement(req.user!, id, data));
  }

  async count(req: Request, res: Response) {
    const data = inventoryCountSchema.parse(req.body);
    return res.status(201).json(await inventoryService.count(req.user!, data));
  }
}

export const inventoryController = new InventoryController();
