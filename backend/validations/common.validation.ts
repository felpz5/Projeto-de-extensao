import { z } from 'zod';
import { isValidTimezone } from '@/utils/date';

export const uuid = z.string().uuid('Identificador inválido');

export const pagination = {
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).max(1_000_000).default(0),
};

// ---------- Números (limites = tamanho das colunas no banco) ----------

/** Mensagem só para tipo errado; campo ausente continua com a mensagem padrão ("obrigatório"). */
const wrongType = (message: string) => (issue: { input?: unknown }) =>
  issue.input === undefined ? undefined : message;

const number = z.number({ error: wrongType('Deve ser um número') }).finite('Número inválido');

/** Quantidade de estoque/receita: numeric(14,3). */
export const MAX_QUANTITY = 99_999_999_999;
/** Dinheiro: numeric(12,2). */
export const MAX_MONEY = 9_999_999_999;
/** Custo unitário: numeric(12,4). */
export const MAX_UNIT_COST = 99_999_999;
/** Peso em gramas: numeric(10,1). */
export const MAX_WEIGHT_G = 999_999_999;
/** Quantidade de um item de venda: numeric(10,3). */
export const MAX_ITEM_QUANTITY = 9_999_999;

const tooBig = (max: number) => `Valor máximo: ${max.toLocaleString('pt-BR')}`;

export const quantity = number
  .positive('Deve ser maior que zero')
  .max(MAX_QUANTITY, tooBig(MAX_QUANTITY));
export const stockLimit = number
  .min(0, 'Não pode ser negativo')
  .max(MAX_QUANTITY, tooBig(MAX_QUANTITY));
export const money = number.min(0, 'Não pode ser negativo').max(MAX_MONEY, tooBig(MAX_MONEY));
export const unitCost = number
  .min(0, 'Não pode ser negativo')
  .max(MAX_UNIT_COST, tooBig(MAX_UNIT_COST));
export const weightG = number
  .positive('Deve ser maior que zero')
  .max(MAX_WEIGHT_G, tooBig(MAX_WEIGHT_G));
export const itemQuantity = number
  .positive('Deve ser maior que zero')
  .max(MAX_ITEM_QUANTITY, tooBig(MAX_ITEM_QUANTITY));
/** Diferença com sinal (ajuste de estoque). */
export const signedQuantity = number
  .refine((n) => n !== 0, 'Quantidade não pode ser zero')
  .refine((n) => Math.abs(n) <= MAX_QUANTITY, tooBig(MAX_QUANTITY));
export const percentage = number.gt(0, 'Deve ser maior que zero').max(100, 'Máximo 100%');

// ---------- Datas ----------

const FUTURE_TOLERANCE_MS = 5 * 60_000;

/** Data e hora ISO 8601 com fuso (ex.: 2026-11-12T10:00:00-03:00 ou ...Z). Não aceita null nem número. */
export const timestamp = z
  .string({ error: wrongType('Data inválida') })
  .datetime({
    offset: true,
    message: 'Data inválida: use ISO 8601 com fuso (ex.: 2026-11-12T10:00:00-03:00)',
  })
  .transform((s) => new Date(s));

/** Instante que não pode estar no futuro (tolerância de 5 min para relógios desacertados). */
export const pastTimestamp = timestamp.refine(
  (d) => d.getTime() <= Date.now() + FUTURE_TOLERANCE_MS,
  'A data não pode estar no futuro',
);

/**
 * Filtro de data da query string: só o dia (2026-11-30, no fuso do estabelecimento)
 * ou data e hora com fuso. Continua texto: o service converte com o fuso da loja.
 */
export const dateFilter = z
  .string()
  .refine(
    (s) =>
      z.string().date().safeParse(s).success ||
      z.string().datetime({ offset: true }).safeParse(s).success,
    'Data inválida: use 2026-11-30 ou 2026-11-30T15:00:00-03:00',
  );

export const timezone = z.string().refine(isValidTimezone, 'Fuso horário inválido');

/** Filtro booleano vindo da query string (?active=true). */
export const booleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

export const periodQuery = z
  .object({
    from: dateFilter.optional(),
    to: dateFilter.optional(),
  })
  .strict();
