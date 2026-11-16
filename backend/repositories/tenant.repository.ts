import type { Prisma } from '@prisma/client';
import type { Tx } from '@/config/database';

export class TenantRepository {
  findById(tx: Tx, id: string) {
    return tx.tenant.findUniqueOrThrow({ where: { id } });
  }

  /** Fuso e se é a loja de demonstração (dados simulados). */
  findForecastInfo(tx: Tx, id: string) {
    return tx.tenant.findUniqueOrThrow({
      where: { id },
      select: { timezone: true, isDemo: true },
    });
  }

  async findTimezone(tx: Tx, id: string): Promise<string> {
    const { timezone } = await tx.tenant.findUniqueOrThrow({
      where: { id },
      select: { timezone: true },
    });
    return timezone;
  }

  create(tx: Tx, data: Prisma.TenantUncheckedCreateInput) {
    return tx.tenant.create({ data });
  }

  update(tx: Tx, id: string, data: Prisma.TenantUpdateInput) {
    return tx.tenant.update({ where: { id }, data });
  }
}

export const tenantRepository = new TenantRepository();
