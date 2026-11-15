import type { Request, Response } from 'express';
import { forecastService } from '@/services/forecast.service';
import { productForecastQuery, reorderQuery } from '@/validations/forecast.validation';

export class ForecastController {
  /** Demanda prevista por produto nos próximos `horizonDays` dias. */
  async products(req: Request, res: Response) {
    const { horizonDays } = productForecastQuery.parse(req.query);
    return res.json(await forecastService.productDemand(req.user!, horizonDays));
  }

  /** Sugestão de compra por ingrediente para cobrir prazo de entrega + `coverageDays`. */
  async reorder(req: Request, res: Response) {
    const { coverageDays } = reorderQuery.parse(req.query);
    return res.json(await forecastService.reorder(req.user!, coverageDays));
  }
}

export const forecastController = new ForecastController();
