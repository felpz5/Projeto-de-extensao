import type { Request, Response } from 'express';
import { saleService } from '@/services/sale.service';
import { periodQuery, uuid } from '@/validations/common.validation';
import { createSaleSchema, listSalesQuery } from '@/validations/sale.validation';

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

  async show(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    return res.json(await saleService.getById(req.user!, id));
  }

  /** Excluir a venda desfaz as baixas de estoque que ela gerou. */
  async destroy(req: Request, res: Response) {
    const id = uuid.parse(req.params.id);
    await saleService.remove(req.user!, id);
    return res.status(204).send();
  }
}

export const saleController = new SaleController();
