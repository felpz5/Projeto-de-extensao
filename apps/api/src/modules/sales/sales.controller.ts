import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { AuthContext } from '../../common/auth-context';
import { Auth, Roles } from '../../common/decorators';
import { uuid } from '../../common/schemas';
import { ZodPipe } from '../../common/zod.pipe';
import {
  CreateSaleInput,
  createSaleSchema,
  ListSalesQuery,
  listSalesQuery,
  PeriodQuery,
  periodQuery,
} from './sales.schemas';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  /** Registra venda presencial (valor + peso) ou online (ingredientes escolhidos). */
  @Post()
  create(@Auth() auth: AuthContext, @Body(new ZodPipe(createSaleSchema)) body: CreateSaleInput) {
    return this.sales.create(auth, body);
  }

  @Get()
  list(@Auth() auth: AuthContext, @Query(new ZodPipe(listSalesQuery)) q: ListSalesQuery) {
    return this.sales.list(auth, q);
  }

  @Get('summary')
  summary(@Auth() auth: AuthContext, @Query(new ZodPipe(periodQuery)) q: PeriodQuery) {
    return this.sales.summary(auth, q);
  }

  @Get('top-products')
  topProducts(@Auth() auth: AuthContext, @Query(new ZodPipe(periodQuery)) q: PeriodQuery) {
    return this.sales.topProducts(auth, q);
  }

  @Get(':id')
  get(@Auth() auth: AuthContext, @Param('id', new ZodPipe(uuid)) id: string) {
    return this.sales.get(auth, id);
  }

  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  @Delete(':id')
  remove(@Auth() auth: AuthContext, @Param('id', new ZodPipe(uuid)) id: string) {
    return this.sales.remove(auth, id);
  }
}
