import type { Request, Response } from 'express';
import { saleImportService } from '@/services/sale-import.service';
import { importIdParams, saleImportSchema } from '@/validations/sale-import.validation';

export class SaleImportController {
  /** Valida e resume o arquivo SEM gravar nada (pré-visualização). */
  async preview(req: Request, res: Response) {
    const input = saleImportSchema.parse(req.body);
    return res.json(await saleImportService.preview(req.user!, input));
  }

  /** Importa o lote inteiro numa transação (tudo ou nada). */
  async commit(req: Request, res: Response) {
    const input = saleImportSchema.parse(req.body);
    return res.status(201).json(await saleImportService.commit(req.user!, input));
  }

  async list(req: Request, res: Response) {
    return res.json(await saleImportService.list(req.user!));
  }

  /** Desfaz: cancela as vendas do lote (nada é apagado). */
  async undo(req: Request, res: Response) {
    const { id } = importIdParams.parse(req.params);
    return res.json(await saleImportService.undo(req.user!, id));
  }
}

export const saleImportController = new SaleImportController();
