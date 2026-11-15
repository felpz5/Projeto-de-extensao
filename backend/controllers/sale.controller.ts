import type { Request, Response } from 'express';
import { saleService } from '@/services/sale.service';
import { periodQuery, uuid } from '@/validations/common.validation';
import {
  cancelSaleSchema,
  cashQuery,
  createSaleSchema,
  listSalesQuery,
} from '@/validations/sale.validation';

export class SaleController {
  /** Registra venda presencial (valor + peso) ou online (ingredientes escolhidos). */
  async store(req: Request, res: Response) {
    const data = createSaleSchema.parse(req.body);
    return res.status(201).json(await saleService.create(req.user!, data));
  }

  async index(req: Request, res: Response) {
    const query = listSalesQuery.parse(req.query);
    return res.json(await saleService.list(req.user!, query));
  }

  async summary(req: Request, res: Response) {
    const query = periodQuery.parse(req.query);
    return res.json(await saleService.summary(req.user!, query));
  }

  async topProducts(req: Request, res: Response) {
    const query = periodQuery.parse(req.query);
    return res.json(await saleService.topProducts(req.user!, query));
  }

  /** Fechamento de caixa do dia (funcionário: só o próprio). */
  async cash(req: Request, res: Response) {
    const query = cashQuery.parse(req.query);
    return res.json(await saleService.cash(req.user!, query));
  }

  async show(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    return res.json(await saleService.getById(req.user!, id));
  }

  /** Cancela (com motivo) e estorna o estoque. Venda nunca é apagada. */
  async cancel(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    const { reason } = cancelSaleSchema.parse(req.body);
    return res.json(await saleService.cancel(req.user!, id, reason));
  }

  /** Corrige: cancela a original e registra a versão certa ligada a ela. */
  async correct(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    const data = createSaleSchema.parse(req.body);
    return res.status(201).json(await saleService.correct(req.user!, id, data));
  }
}

export const saleController = new SaleController();
