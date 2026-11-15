import { withContext } from '@/config/database';
import {
  stockMovementRepository,
  type StockMovementRepository,
} from '@/repositories/stock-movement.repository';
import { forecastService, type ForecastService } from '@/services/forecast.service';
import { inventoryService, type InventoryService } from '@/services/inventory.service';
import { saleService, type SaleService } from '@/services/sale.service';
import type { AuthContext } from '@/types/auth.types';
import type { PeriodQuery } from '@/types/sale.types';

export class DashboardService {
  constructor(
    private readonly sales: SaleService,
    private readonly inventory: InventoryService,
    private readonly forecast: ForecastService,
    private readonly movements: StockMovementRepository,
  ) {}

  /**
   * Tudo que a tela inicial precisa, numa única chamada.
   * Funcionário (STAFF) vê só o estoque: faturamento, ranking e sugestões de compra são
   * relatórios de gerente/dono (planejamento, seção 4.3) e voltam como null.
   */
  overview(auth: AuthContext, q: PeriodQuery) {
    const isManager = auth.role !== 'STAFF';

    return withContext(auth, async (tx) => {
      const period = await this.sales.period(tx, auth.tenantId, q);
      const summary = isManager ? await this.sales.computeSummary(tx, auth.tenantId, period) : null;
      const topProducts = isManager
        ? await this.sales.computeTopProducts(tx, auth.tenantId, period, 5)
        : null;
      const levels = await this.inventory.computeLevels(tx, auth.tenantId);
      const recentMovements = await this.movements.listRecent(tx, auth.tenantId, 10);
      const reorder = isManager ? await this.forecast.computeReorder(tx, auth.tenantId, 7) : null;

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

export const dashboardService = new DashboardService(
  saleService,
  inventoryService,
  forecastService,
  stockMovementRepository,
);
