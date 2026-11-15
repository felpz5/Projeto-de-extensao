import type { Tx } from '@/config/database';
import type { DailyRow } from '@/types/forecast.types';

/** Consumo diário de um ingrediente, separado em saídas registradas e ajustes de inventário. */
export interface ConsumptionRow {
  id: string;
  day: string;
  /** Saídas registradas (vendas, saídas manuais, perdas), positivo. */
  outflow: number;
  /** Soma dos ajustes de inventário do dia, com sinal (− = consumiu mais que o registrado). */
  adjustment: number;
  estimated: boolean;
}

/** Séries diárias usadas pela previsão (datas no fuso do estabelecimento, YYYY-MM-DD). */
export class ForecastRepository {
  /** Unidades vendidas por produto e dia. */
  productDailyDemand(tx: Tx, tenantId: string, timezone: string, start: string, end: string) {
    return tx.$queryRaw<DailyRow[]>`
      SELECT si.product_id AS id,
             to_char(((s.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day,
             SUM(si.quantity)::float8 AS value
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.tenant_id = ${tenantId}::uuid
        AND s.status = 'COMPLETED'
        AND ((s.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date BETWEEN ${start}::date AND ${end}::date
      GROUP BY 1, 2`;
  }

  /**
   * Saídas e ajustes por ingrediente e dia. Lançamentos estornados (e os próprios estornos)
   * ficam de fora: foram digitados errado e não representam consumo.
   */
  ingredientDailyConsumption(
    tx: Tx,
    tenantId: string,
    timezone: string,
    start: string,
    end: string,
  ) {
    return tx.$queryRaw<ConsumptionRow[]>`
      SELECT m.ingredient_id AS id,
             to_char(((m.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(-m.quantity) FILTER (
               WHERE m.type::text IN ('SALE_CONSUMPTION', 'MANUAL_OUT', 'LOSS') AND m.quantity < 0
             ), 0)::float8 AS outflow,
             COALESCE(SUM(m.quantity) FILTER (WHERE m.type::text = 'ADJUSTMENT'), 0)::float8 AS adjustment,
             bool_or(m.is_estimated) AS estimated
      FROM stock_movements m
      WHERE m.tenant_id = ${tenantId}::uuid
        AND m.reversed_at IS NULL
        AND m.reverses_id IS NULL
        AND m.type::text IN ('SALE_CONSUMPTION', 'MANUAL_OUT', 'LOSS', 'ADJUSTMENT')
        AND ((m.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date BETWEEN ${start}::date AND ${end}::date
      GROUP BY 1, 2`;
  }

  /** Início do histórico de cada ingrediente = primeira movimentação válida de qualquer tipo. */
  ingredientFirstMovementDays(tx: Tx, tenantId: string, timezone: string) {
    return tx.$queryRaw<{ id: string; day: string }[]>`
      SELECT m.ingredient_id AS id,
             to_char(MIN(((m.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date), 'YYYY-MM-DD') AS day
      FROM stock_movements m
      WHERE m.tenant_id = ${tenantId}::uuid
        AND m.reversed_at IS NULL
        AND m.reverses_id IS NULL
      GROUP BY 1`;
  }
}

export const forecastRepository = new ForecastRepository();
