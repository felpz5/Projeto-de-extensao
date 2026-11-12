import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuthContext } from '../../common/auth-context';
import { Auth, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ForecastingService } from './forecasting.service';

const productsQuery = z
  .object({ horizonDays: z.coerce.number().int().min(1).max(30).default(7) })
  .strict();
const reorderQuery = z
  .object({ coverageDays: z.coerce.number().int().min(1).max(60).default(7) })
  .strict();

@Roles('OWNER', 'MANAGER')
@Controller('forecast')
export class ForecastingController {
  constructor(private readonly forecasting: ForecastingService) {}

  /** Demanda prevista por produto nos próximos `horizonDays` dias. */
  @Get('products')
  products(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(productsQuery)) q: z.infer<typeof productsQuery>,
  ) {
    return this.forecasting.products(auth, q.horizonDays);
  }

  /** Sugestão de compra por ingrediente para cobrir prazo de entrega + `coverageDays`. */
  @Get('reorder')
  reorder(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(reorderQuery)) q: z.infer<typeof reorderQuery>,
  ) {
    return this.forecasting.reorder(auth, q.coverageDays);
  }
}
