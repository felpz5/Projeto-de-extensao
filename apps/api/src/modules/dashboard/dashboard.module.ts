import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { AuthContext } from '../../common/auth-context';
import { Auth } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ForecastingModule } from '../forecasting/forecasting.module';
import { ForecastingService } from '../forecasting/forecasting.service';
import { InventoryModule } from '../inventory/inventory.module';
import { InventoryService } from '../inventory/inventory.service';
import { periodQuery, PeriodQuery } from '../sales/sales.schemas';
import { resolvePeriod, SalesService } from '../sales/sales.service';
import { SalesModule } from '../sales/sales.module';

@Injectable()
export class DashboardService {
  constructor(
    private readonly db: PrismaService,
    private readonly sales: SalesService,
    private readonly inventory: InventoryService,
    private readonly forecasting: ForecastingService,
  ) {}

  /** Tudo que a tela inicial precisa, numa única chamada. */
  overview(auth: AuthContext, q: PeriodQuery) {
    const period = resolvePeriod(q);
    const canSeeForecast = auth.role !== 'STAFF';

    return this.db.withContext(auth, async (tx) => {
      const summary = await this.sales.computeSummary(tx, auth.tenantId, period);
      const topProducts = await this.sales.computeTopProducts(tx, auth.tenantId, period, 5);
      const levels = await this.inventory.computeLevels(tx, auth.tenantId);
      const recentMovements = await tx.stockMovement.findMany({
        where: { tenantId: auth.tenantId },
        include: { ingredient: { select: { id: true, name: true, baseUnit: true } } },
        orderBy: { occurredAt: 'desc' },
        take: 10,
      });
      const reorder = canSeeForecast
        ? await this.forecasting.computeReorder(tx, auth.tenantId, 7)
        : null;

      const stockValue = levels.reduce((s, l) => s + (l.stockValue?.toNumber() ?? 0), 0);
      return {
        sales: summary,
        topProducts,
        stock: {
          totalIngredients: levels.length,
          ok: levels.filter((l) => l.status === 'OK').length,
          low: levels.filter((l) => l.status === 'LOW').length,
          out: levels.filter((l) => l.status === 'OUT').length,
          estimatedValue: Math.round(stockValue * 100) / 100,
          alerts: levels.filter((l) => l.status !== 'OK'),
        },
        recentMovements,
        reorderSuggestions: reorder && {
          disclaimer: reorder.disclaimer,
          items: reorder.items
            .filter((i) => !['OK', 'NO_HISTORY'].includes(i.recommendation.urgency))
            .slice(0, 5),
        },
      };
    });
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  overview(@Auth() auth: AuthContext, @Query(new ZodPipe(periodQuery)) q: PeriodQuery) {
    return this.dashboard.overview(auth, q);
  }
}

@Module({
  imports: [SalesModule, InventoryModule, ForecastingModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
