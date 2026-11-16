import { z } from 'zod';
import { uuid } from '@/validations/common.validation';
import { paymentMethod } from '@/validations/sale.validation';

/** Limite por arquivo: ~3 anos de uma loja com 10 vendas/dia. */
export const MAX_IMPORT_ROWS = 15_000;
/** Até quantos anos para trás uma venda importada pode estar. */
export const MAX_IMPORT_YEARS = 5;

const cell = z.string().trim().max(200).optional();

/**
 * Uma linha do arquivo, já com as colunas mapeadas pela tela, mas com os valores ORIGINAIS
 * (texto). A conversão e a validação acontecem no servidor, para valer as mesmas regras em
 * qualquer cliente.
 */
const importRow = z
  .object({
    line: z.number().int().min(1),
    date: cell,
    time: cell,
    product: cell,
    quantity: cell,
    total: cell,
    weightG: cell,
    channel: cell,
    payment: cell,
  })
  .strict();

export const saleImportSchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    rows: z
      .array(importRow)
      .min(1, 'O arquivo não tem linhas')
      .max(
        MAX_IMPORT_ROWS,
        `Máximo de ${MAX_IMPORT_ROWS.toLocaleString('pt-BR')} linhas por arquivo`,
      ),
    defaults: z
      .object({
        /** Produto das linhas sem coluna de produto (ex.: caderno com só o valor da venda). */
        productId: uuid.optional(),
        channel: z.enum(['IN_STORE', 'ONLINE']).default('IN_STORE'),
        paymentMethod: paymentMethod.optional(),
      })
      .strict()
      // prefault (não default): no Zod 4 o default pula a validação e não aplicaria os padrões internos
      .prefault({}),
    /** Confirmação explícita para importar num período que já tem vendas registradas. */
    allowOverlap: z.boolean().default(false),
  })
  .strict();

export const importIdParams = z.object({ id: uuid }).strict();
