import type { Tx } from '@/config/database';
import type { DailyRow } from '@/types/forecast.types';
import { addDays, startOfDayIn } from '@/utils/date';

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

/**
 * Intervalo [início do dia `start`, início do dia seguinte a `end`) no fuso da loja, em UTC.
 * Filtrar a COLUNA crua por esse intervalo deixa o Postgres usar o índice (tenant_id, data):
 * converter o fuso dentro do WHERE obrigava a ler o histórico inteiro (1 milhão de linhas em
 * 3 anos de uso). A conversão de fuso fica só no agrupamento por dia.
 */
function bounds(timezone: string, start: string, end: string) {
  return { from: startOfDayIn(start, timezone), to: startOfDayIn(addDays(end, 1), timezone) };
}

/** Séries diárias usadas pela previsão (datas no fuso do estabelecimento, YYYY-MM-DD). */
export class ForecastRepository {
  /** Unidades vendidas por produto e dia. */
  productDailyDemand(tx: Tx, tenantId: string, timezone: string, start: string, end: string) {
    const { from, to } = bounds(timezone, start, end);
    return tx.$queryRaw<DailyRow[]>`
      SELECT si.product_id AS id,
             to_char(((s.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day,
             SUM(si.quantity)::float8 AS value
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      WHERE s.tenant_id = ${tenantId}::uuid
        AND s.status = 'COMPLETED'
        AND s.sold_at >= (CAST(${from} AS timestamptz) AT TIME ZONE 'UTC')
        AND s.sold_at < (CAST(${to} AS timestamptz) AT TIME ZONE 'UTC')
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
    const { from, to } = bounds(timezone, start, end);
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
        AND m.occurred_at >= (CAST(${from} AS timestamptz) AT TIME ZONE 'UTC')
        AND m.occurred_at < (CAST(${to} AS timestamptz) AT TIME ZONE 'UTC')
        AND m.reversed_at IS NULL
        AND m.reverses_id IS NULL
        AND m.type::text IN ('SALE_CONSUMPTION', 'MANUAL_OUT', 'LOSS', 'ADJUSTMENT')
      GROUP BY 1, 2`;
  }

  /**
   * Início do histórico de cada ingrediente = primeira movimentação válida de qualquer tipo.
   * Uma busca por ingrediente no índice (tenant_id, ingredient_id, occurred_at) que para na
   * primeira linha válida — antes era MIN() sobre o histórico inteiro.
   */
  ingredientFirstMovementDays(tx: Tx, tenantId: string, timezone: string) {
    return tx.$queryRaw<{ id: string; day: string }[]>`
      SELECT i.id,
             to_char(((f.first_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day
      FROM ingredients i
      CROSS JOIN LATERAL (
        SELECT m.occurred_at AS first_at
        FROM stock_movements m
        WHERE m.tenant_id = ${tenantId}::uuid
          AND m.ingredient_id = i.id
          AND m.reversed_at IS NULL
          AND m.reverses_id IS NULL
        ORDER BY m.occurred_at
        LIMIT 1
      ) f
      WHERE i.tenant_id = ${tenantId}::uuid`;
  }
}

export const forecastRepository = new ForecastRepository();
