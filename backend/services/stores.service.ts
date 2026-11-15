import { Prisma } from '@prisma/client';
import { withContext } from '@/config/database';
import {
  membershipRepository,
  type MembershipRepository,
} from '@/repositories/membership.repository';
import { saleRepository, type SaleRepository } from '@/repositories/sale.repository';
import { tenantRepository, type TenantRepository } from '@/repositories/tenant.repository';
import { inventoryService, type InventoryService } from '@/services/inventory.service';
import type { AuthContext } from '@/types/auth.types';
import { addDays, startOfDayIn, todayIn } from '@/utils/date';

/**
 * "Minhas lojas": resumo de todos os estabelecimentos em que a pessoa é dona ou gerente.
 * Cada loja é lida dentro do PRÓPRIO contexto (RLS do tenant): nada de consulta que cruze lojas.
 */
export class StoresService {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly tenants: TenantRepository,
    private readonly sales: SaleRepository,
    private readonly inventory: InventoryService,
  ) {}

  async overview(auth: AuthContext, days: number) {
    const memberships = await withContext({ userId: auth.userId }, (tx) =>
      this.memberships.listActiveForUser(tx, auth.userId),
    );
    const managed = memberships.filter((m) => m.role === 'OWNER' || m.role === 'MANAGER');

    const stores = await Promise.all(
      managed.map((m) =>
        withContext({ tenantId: m.tenantId, userId: auth.userId }, async (tx) => {
          const tz = await this.tenants.findTimezone(tx, m.tenantId);
          const today = todayIn(tz);
          const todayRange = {
            gte: startOfDayIn(today, tz),
            lt: startOfDayIn(addDays(today, 1), tz),
          };
          const periodRange = {
            gte: startOfDayIn(addDays(today, -(days - 1)), tz),
            lt: todayRange.lt,
          };
          const base = { tenantId: m.tenantId, status: 'COMPLETED' as const };

          const [todayTotals, periodTotals, levels] = await Promise.all([
            this.sales.totals(tx, { ...base, soldAt: todayRange }),
            this.sales.totals(tx, { ...base, soldAt: periodRange }),
            this.inventory.computeLevels(tx, m.tenantId),
          ]);
          const revenue = periodTotals._sum.totalAmount ?? new Prisma.Decimal(0);
          return {
            tenant: { id: m.tenant.id, name: m.tenant.name, slug: m.tenant.slug },
            role: m.role,
            current: m.tenantId === auth.tenantId,
            today: {
              orders: todayTotals._count,
              revenue: todayTotals._sum.totalAmount ?? new Prisma.Decimal(0),
            },
            period: {
              days,
              orders: periodTotals._count,
              revenue,
              averageTicket: periodTotals._count
                ? revenue.div(periodTotals._count).toDecimalPlaces(2)
                : new Prisma.Decimal(0),
            },
            stock: {
              low: levels.filter((l) => l.status === 'LOW').length,
              out: levels.filter((l) => l.status === 'OUT').length,
            },
          };
        }),
      ),
    );

    const sum = (pick: (s: (typeof stores)[number]) => Prisma.Decimal) =>
      stores.reduce((acc, s) => acc.plus(pick(s)), new Prisma.Decimal(0));
    return {
      days,
      stores,
      totals: {
        todayRevenue: sum((s) => s.today.revenue),
        todayOrders: stores.reduce((a, s) => a + s.today.orders, 0),
        periodRevenue: sum((s) => s.period.revenue),
        periodOrders: stores.reduce((a, s) => a + s.period.orders, 0),
      },
    };
  }
}

export const storesService = new StoresService(
  membershipRepository,
  tenantRepository,
  saleRepository,
  inventoryService,
);
