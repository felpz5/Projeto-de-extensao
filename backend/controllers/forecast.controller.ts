import type { Request, Response } from 'express';
import { forecastService } from '@/services/forecast.service';
import {
  accuracyQuery,
  productDetailParams,
  productDetailQuery,
  productForecastQuery,
  reorderQuery,
} from '@/validations/forecast.validation';

export class ForecastController {
  /** Demanda prevista por produto nos próximos `horizonDays` dias (com a precisão medida). */
  async products(req: Request, res: Response) {
    const { horizonDays } = productForecastQuery.parse(req.query);
    return res.json(await forecastService.productDemand(req.user!, horizonDays));
  }

  /** Um produto: histórico, previsão, backtesting com todos os modelos, explicação e avisos. */
  async product(req: Request, res: Response) {
    const { id } = productDetailParams.parse(req.params);
    const { horizonDays, lookbackDays } = productDetailQuery.parse(req.query);
    return res.json(await forecastService.productDetail(req.user!, id, horizonDays, lookbackDays));
  }

  /** Precisão da previsão na loja: backtesting de todas as séries, agregado por unidade. */
  async accuracy(req: Request, res: Response) {
    const { lookbackDays } = accuracyQuery.parse(req.query);
    return res.json(await forecastService.accuracy(req.user!, lookbackDays));
  }

  /** Sugestão de compra por ingrediente para cobrir prazo de entrega + `coverageDays`. */
  async reorder(req: Request, res: Response) {
    const { coverageDays } = reorderQuery.parse(req.query);
    return res.json(await forecastService.reorder(req.user!, coverageDays));
  }
}

export const forecastController = new ForecastController();
