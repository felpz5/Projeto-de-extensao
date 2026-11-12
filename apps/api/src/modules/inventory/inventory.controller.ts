import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AuthContext } from '../../common/auth-context';
import { Auth, Roles } from '../../common/decorators';
import { uuid } from '../../common/schemas';
import { ZodPipe } from '../../common/zod.pipe';
import {
  CreateMovementInput,
  createMovementSchema,
  InventoryCountInput,
  inventoryCountSchema,
  ListMovementsQuery,
  listMovementsQuery,
} from './inventory.schemas';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /** Saldo de todos os ingredientes ativos, com status OK / LOW / OUT. */
  @Get('levels')
  levels(@Auth() auth: AuthContext) {
    return this.inventory.levels(auth);
  }

  @Get('low-stock')
  lowStock(@Auth() auth: AuthContext) {
    return this.inventory.lowStock(auth);
  }

  @Get('movements')
  movements(@Auth() auth: AuthContext, @Query(new ZodPipe(listMovementsQuery)) q: ListMovementsQuery) {
    return this.inventory.listMovements(auth, q);
  }

  /** Funcionários podem lançar entradas e saídas; ajustes ficam com gerente ou dono. */
  @Post('movements')
  createMovement(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(createMovementSchema)) body: CreateMovementInput,
  ) {
    if (body.type === 'ADJUSTMENT' && auth.role === 'STAFF') {
      throw new ForbiddenException('Ajustes de estoque são feitos por gerente ou dono');
    }
    return this.inventory.createMovement(auth, body);
  }

  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  @Delete('movements/:id')
  deleteMovement(@Auth() auth: AuthContext, @Param('id', new ZodPipe(uuid)) id: string) {
    return this.inventory.deleteMovement(auth, id);
  }

  @Roles('OWNER', 'MANAGER')
  @Post('counts')
  count(@Auth() auth: AuthContext, @Body(new ZodPipe(inventoryCountSchema)) body: InventoryCountInput) {
    return this.inventory.count(auth, body);
  }
}
