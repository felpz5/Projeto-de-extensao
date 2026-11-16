/**
 * Conversão e validação das linhas importadas (funções puras, sem banco: testáveis isoladas).
 * Regras de negócio da importação: ver sale-import.service.ts.
 */
import type { PaymentMethod, PricingMode, SaleChannel } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { addDays } from '@/utils/date';
import { sha256 } from '@/utils/token';
import { MAX_ITEM_QUANTITY, MAX_MONEY, MAX_WEIGHT_G } from '@/validations/common.validation';
import { MAX_IMPORT_YEARS, type saleImportSchema } from '@/validations/sale-import.validation';

export type SaleImportDTO = z.infer<typeof saleImportSchema>;
type RawRow = SaleImportDTO['rows'][number];

/** Linha já convertida e validada. */
export interface ParsedRow {
  line: number;
  day: string; // YYYY-MM-DD (fuso da loja)
  time: string; // HH:MM
  productId: string;
  quantity: number;
  total: number;
  weightG: number | null;
  channel: SaleChannel;
  paymentMethod: PaymentMethod | null;
  totalFromPrice: boolean;
}

export interface ImportProduct {
  id: string;
  name: string;
  pricingMode: PricingMode;
  price: Prisma.Decimal;
}

/** "Açaí  no Peso" → "acai no peso" (comparação de nomes sem acento/caixa/espaços extras). */
export const normalizeName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Chave de comparação de opções: "Vale-refeição", "VALE_REFEICAO" e "vale refeição" são iguais. */
const optionKey = (s: string) => normalizeName(s).replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Número em formato brasileiro ou internacional: "1.234,56", "R$ 12,50", "12.5", "300".
 * Devolve null se não for um número válido (nunca "adivinha").
 */
export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.replace(/R\$|\s/gi, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  // "1.500" = mil e quinhentos (o milhar pt-BR nunca começa com 0: "0.500" é meio)
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** "2026-03-07", "07/03/2026" ou "7/3/2026" → "2026-03-07"; data inexistente → null. */
export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (br) [d, m, y] = [Number(br[1]), Number(br[2]), Number(br[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return date.toISOString().slice(0, 10);
}

export function parseTime(raw: string | undefined): string | null {
  if (!raw) return '12:00';
  const t = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
  return `${t[1].padStart(2, '0')}:${t[2]}`;
}

const CHANNELS: Record<string, SaleChannel> = {
  balcao: 'IN_STORE',
  presencial: 'IN_STORE',
  loja: 'IN_STORE',
  'in store': 'IN_STORE',
  online: 'ONLINE',
  site: 'ONLINE',
  internet: 'ONLINE',
  delivery: 'ONLINE',
};
const PAYMENTS: Record<string, PaymentMethod> = {
  dinheiro: 'CASH',
  especie: 'CASH',
  cash: 'CASH',
  pix: 'PIX',
  credito: 'CREDIT_CARD',
  'cartao de credito': 'CREDIT_CARD',
  'credit card': 'CREDIT_CARD',
  debito: 'DEBIT_CARD',
  'cartao de debito': 'DEBIT_CARD',
  'debit card': 'DEBIT_CARD',
  vale: 'VOUCHER',
  voucher: 'VOUCHER',
  'vale refeicao': 'VOUCHER',
  outro: 'OTHER',
  other: 'OTHER',
};

/** Converte e valida as linhas. Não toca no banco: devolve linhas válidas e erros por linha. */
export function parseRows(
  rows: RawRow[],
  products: ImportProduct[],
  defaults: SaleImportDTO['defaults'],
  limits: { minDay: string; maxDay: string },
) {
  const byName = new Map<string, ImportProduct[]>();
  for (const p of products) {
    const key = normalizeName(p.name);
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  const byId = new Map(products.map((p) => [p.id, p]));
  const errors: { line: number; message: string }[] = [];
  const valid: ParsedRow[] = [];

  for (const r of rows) {
    const fail = (message: string) => errors.push({ line: r.line, message });

    const day = parseDate(r.date);
    if (!day) {
      fail(r.date ? `Data inválida: "${r.date}" (use AAAA-MM-DD ou DD/MM/AAAA)` : 'Sem data');
      continue;
    }
    if (day > limits.maxDay) {
      fail(`Data ${day} não é anterior a hoje (o caixa do dia não pode ser importado)`);
      continue;
    }
    if (day < limits.minDay) {
      fail(`Data ${day} fora do período permitido (até ${MAX_IMPORT_YEARS} anos atrás)`);
      continue;
    }
    const time = parseTime(r.time);
    if (!time) {
      fail(`Hora inválida: "${r.time}" (use HH:MM)`);
      continue;
    }

    let product: ImportProduct | undefined;
    if (r.product) {
      const found = byName.get(normalizeName(r.product)) ?? [];
      if (found.length > 1) {
        fail(`Há mais de um produto chamado "${r.product}": renomeie um deles antes`);
        continue;
      }
      product = found[0];
      if (!product) {
        fail(`Produto não encontrado: "${r.product}" (cadastre-o ou corrija o nome)`);
        continue;
      }
    } else if (defaults.productId) {
      product = byId.get(defaults.productId);
      if (!product) {
        fail('Produto padrão não encontrado');
        continue;
      }
    } else {
      fail('Sem produto (escolha a coluna de produto ou um produto padrão)');
      continue;
    }

    const quantity = r.quantity ? parseNumber(r.quantity) : 1;
    if (quantity === null || quantity <= 0 || quantity > MAX_ITEM_QUANTITY) {
      fail(`Quantidade inválida: "${r.quantity}" (precisa ser maior que zero)`);
      continue;
    }
    const weightG = r.weightG ? parseNumber(r.weightG) : null;
    if (r.weightG && (weightG === null || weightG <= 0 || weightG > MAX_WEIGHT_G)) {
      fail(`Peso inválido: "${r.weightG}" (em gramas, maior que zero)`);
      continue;
    }

    let total = r.total ? parseNumber(r.total) : null;
    let totalFromPrice = false;
    if (r.total && (total === null || total < 0 || total > MAX_MONEY)) {
      fail(`Valor inválido: "${r.total}"`);
      continue;
    }
    if (total === null) {
      const price = product.price.toNumber();
      if (product.pricingMode === 'UNIT') total = price * quantity;
      else if (weightG) total = (price * weightG) / 1000;
      else {
        fail('Produto vendido por peso precisa de valor ou peso');
        continue;
      }
      total = Math.round(total * 100) / 100;
      totalFromPrice = true;
    }

    let channel: SaleChannel = defaults.channel;
    if (r.channel) {
      const c = CHANNELS[optionKey(r.channel)];
      if (!c) {
        fail(`Canal desconhecido: "${r.channel}" (use balcão ou online)`);
        continue;
      }
      channel = c;
    }
    let paymentMethod: PaymentMethod | null = defaults.paymentMethod ?? null;
    if (r.payment) {
      const pm = PAYMENTS[optionKey(r.payment)];
      if (!pm) {
        fail(`Forma de pagamento desconhecida: "${r.payment}"`);
        continue;
      }
      paymentMethod = pm;
    }

    valid.push({
      line: r.line,
      day,
      time,
      productId: product.id,
      quantity,
      total,
      weightG,
      channel,
      paymentMethod,
      totalFromPrice,
    });
  }
  return { valid, errors };
}

/** Resumo para a tela de pré-visualização (também usado para conferir antes de gravar). */
export function summarizeRows(valid: ParsedRow[], products: ImportProduct[]) {
  const names = new Map(products.map((p) => [p.id, p.name]));
  const days = [...new Set(valid.map((v) => v.day))].sort();
  const first = days[0] ?? null;
  const last = days[days.length - 1] ?? null;
  let span = 0;
  let gaps = 0;
  if (first && last) {
    const present = new Set(days);
    for (let d = first; d <= last; d = addDays(d, 1)) {
      span++;
      if (!present.has(d)) gaps++;
    }
  }
  const byProduct = new Map<string, { rows: number; quantity: number; amount: number }>();
  for (const v of valid) {
    const acc = byProduct.get(v.productId) ?? { rows: 0, quantity: 0, amount: 0 };
    acc.rows++;
    acc.quantity += v.quantity;
    acc.amount += v.total;
    byProduct.set(v.productId, acc);
  }
  const keys = valid.map((v) =>
    [v.day, v.time, v.productId, v.quantity, v.total, v.weightG, v.channel].join('|'),
  );
  const identicalRows = keys.length - new Set(keys).size;
  return {
    period: { first, last, days: span, daysWithSales: days.length, daysWithoutRows: gaps },
    totalAmount: Math.round(valid.reduce((s, v) => s + v.total, 0) * 100) / 100,
    byProduct: [...byProduct.entries()].map(([id, acc]) => ({
      productId: id,
      name: names.get(id) ?? '?',
      ...acc,
      amount: Math.round(acc.amount * 100) / 100,
    })),
    identicalRows,
    totalFromPrice: valid.filter((v) => v.totalFromPrice).length,
  };
}

/** Hash do CONTEÚDO convertido (não do nome do arquivo): o mesmo histórico não entra 2 vezes. */
export const contentHash = (valid: ParsedRow[]) =>
  sha256(
    JSON.stringify(
      valid.map((v) => [
        v.day,
        v.time,
        v.productId,
        v.quantity,
        v.total,
        v.weightG,
        v.channel,
        v.paymentMethod,
      ]),
    ),
  );
