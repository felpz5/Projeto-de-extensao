import { Prisma } from '@prisma/client';
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
  /**
   * Unidades vendidas por produto e dia (vendas canceladas ficam de fora). `imported` = parte
   * que veio da importação de histórico (para mostrar a origem dos dados).
   * `productId` opcional: série de um só produto.
   */
  productDailyDemand(
    tx: Tx,
    tenantId: string,
    timezone: string,
    start: string,
    end: string,
    productId?: string,
  ) {
    const { from, to } = bounds(timezone, start, end);
    const onlyProduct = productId
      ? Prisma.sql`AND si.product_id = ${productId}::uuid`
      : Prisma.empty;
    return tx.$queryRaw<(DailyRow & { imported: number })[]>`
      SELECT si.product_id AS id,
             to_char(((s.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day,
             SUM(si.quantity)::float8 AS value,
             COALESCE(SUM(si.quantity) FILTER (WHERE s.source = 'IMPORT'), 0)::float8 AS imported
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      WHERE s.tenant_id = ${tenantId}::uuid
        AND s.status = 'COMPLETED'
        AND s.sold_at >= (CAST(${from} AS timestamptz) AT TIME ZONE 'UTC')
        AND s.sold_at < (CAST(${to} AS timestamptz) AT TIME ZONE 'UTC')
        ${onlyProduct}
      GROUP BY 1, 2`;
  }

  /** Pedidos (vendas concluídas) por dia: série da loja inteira. */
  storeDailyOrders(tx: Tx, tenantId: string, timezone: string, start: string, end: string) {
    const { from, to } = bounds(timezone, start, end);
    return tx.$queryRaw<{ day: string; value: number; imported: number }[]>`
      SELECT to_char(((s.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day,
             COUNT(*)::float8 AS value,
             COUNT(*) FILTER (WHERE s.source = 'IMPORT')::float8 AS imported
      FROM sales s
      WHERE s.tenant_id = ${tenantId}::uuid
        AND s.status = 'COMPLETED'
        AND s.sold_at >= (CAST(${from} AS timestamptz) AT TIME ZONE 'UTC')
        AND s.sold_at < (CAST(${to} AS timestamptz) AT TIME ZONE 'UTC')
      GROUP BY 1`;
  }

  /**
   * Variação líquida do saldo por ingrediente e dia (todas as movimentações, inclusive estornos,
   * que se anulam com o original). Usada para saber em que dias o estoque estava zerado.
   */
  ingredientDailyNet(tx: Tx, tenantId: string, timezone: string, start: string, end: string) {
    const { from, to } = bounds(timezone, start, end);
    return tx.$queryRaw<DailyRow[]>`
      SELECT m.ingredient_id AS id,
             to_char(((m.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day,
             SUM(m.quantity)::float8 AS value
      FROM stock_movements m
      WHERE m.tenant_id = ${tenantId}::uuid
        AND m.occurred_at >= (CAST(${from} AS timestamptz) AT TIME ZONE 'UTC')
        AND m.occurred_at < (CAST(${to} AS timestamptz) AT TIME ZONE 'UTC')
      GROUP BY 1, 2`;
  }

  /**
   * Consumo ESTIMADO de ingredientes pelas vendas IMPORTADAS (que não baixaram estoque):
   * - produto com receita fixa: quantidade da receita × unidades vendidas;
   * - produto por peso com composição média: peso × % de cada ingrediente. Sem o peso no
   *   arquivo, o peso é estimado pelo valor ÷ preço por kg atual.
   * Só para a previsão: nada disto entra no estoque.
   */
  importedIngredientConsumption(
    tx: Tx,
    tenantId: string,
    timezone: string,
    start: string,
    end: string,
  ) {
    const { from, to } = bounds(timezone, start, end);
    return tx.$queryRaw<DailyRow[]>`
      WITH items AS (
        SELECT si.product_id, si.quantity, si.unit_price, si.weight_g,
               to_char(((s.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS day
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        WHERE s.tenant_id = ${tenantId}::uuid
          AND s.source = 'IMPORT'
          AND s.status = 'COMPLETED'
          AND s.sold_at >= (CAST(${from} AS timestamptz) AT TIME ZONE 'UTC')
          AND s.sold_at < (CAST(${to} AS timestamptz) AT TIME ZONE 'UTC')
      ), uses AS (
        SELECT r.ingredient_id AS id, it.day, r.quantity * it.quantity AS qty
        FROM items it
        JOIN recipe_items r ON r.product_id = it.product_id AND r.tenant_id = ${tenantId}::uuid
        UNION ALL
        SELECT w.ingredient_id, it.day,
               COALESCE(it.weight_g,
                        CASE WHEN p.price > 0 THEN it.quantity * it.unit_price / p.price * 1000 END)
                 * w.percentage / 100
        FROM items it
        JOIN products p ON p.id = it.product_id AND p.pricing_mode = 'WEIGHT'
        JOIN weight_mix_items w ON w.product_id = it.product_id AND w.tenant_id = ${tenantId}::uuid
      )
      SELECT id, day, SUM(qty)::float8 AS value
      FROM uses
      WHERE qty IS NOT NULL AND qty > 0
      GROUP BY 1, 2`;
  }

  /** Início (UTC) do dia `start` no fuso da loja: o saldo "antes da janela" é medido até aqui. */
  windowStart(timezone: string, start: string) {
    return startOfDayIn(start, timezone);
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
