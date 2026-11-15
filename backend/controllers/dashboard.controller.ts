import type { Request, Response } from 'express';
import { dashboardService } from '@/services/dashboard.service';
import { periodQuery } from '@/validations/common.validation';

export class DashboardController {
  /** Tudo que a tela inicial precisa, numa única chamada. */
  async overview(req: Request, res: Response) {
    const query = periodQuery.parse(req.query);
    return res.json(await dashboardService.overview(req.user!, query));
  }
}

export const dashboardController = new DashboardController();
