import { z } from 'zod';

/**
 * Campos numéricos dos formulários ficam como TEXTO (aceita vírgula: "1,5") e são convertidos
 * só no envio com parseNum(). Assim campo vazio não vira NaN/0 escondido.
 * Os limites espelham os do back-end (backend/validations/common.validation.ts).
 */
export function parseNum(value: string | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  let text = value
    .trim()
    .replace(/\s/g, '')
    .replace(/^[−–]/, '-'); // sinal de menos tipográfico (teclado de celular)
  if (text === '') return undefined;

  if (text.includes(',')) {
    // Padrão brasileiro: "1.234,5" → ponto é milhar, vírgula é decimal.
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(text)) {
    // "1.500" ou "12.000.000" sem vírgula: ponto como separador de milhar (pt-BR).
    // "0.028" e "2.5" continuam decimais.
    text = text.replace(/\./g, '');
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

/** Valor da API (texto/número) → texto do campo, com vírgula decimal ("0.028" → "0,028"). */
export function toInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? String(n).replace('.', ',') : '';
}

interface NumberRules {
  min?: number;
  /** Maior que zero. */
  positive?: boolean;
  max?: number;
  integer?: boolean;
}

function check(rules: NumberRules) {
  return (v: string, ctx: z.RefinementCtx) => {
    const n = parseNum(v);
    if (n === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Número inválido' });
      return;
    }
    if (rules.positive && n <= 0) ctx.addIssue({ code: 'custom', message: 'Deve ser maior que zero' });
    if (rules.min !== undefined && n < rules.min)
      ctx.addIssue({ code: 'custom', message: `Mínimo: ${rules.min}` });
    if (rules.max !== undefined && n > rules.max)
      ctx.addIssue({ code: 'custom', message: `Máximo: ${rules.max.toLocaleString('pt-BR')}` });
    if (rules.integer && !Number.isInteger(n))
      ctx.addIssue({ code: 'custom', message: 'Use um número inteiro' });
  };
}

export const numberField = (rules: NumberRules = {}) =>
  z.string().trim().min(1, 'Obrigatório').superRefine(check(rules));

export const optionalNumberField = (rules: NumberRules = {}) =>
  z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      if (v !== '') check(rules)(v, ctx);
    });

export const LIMITS = {
  quantity: 99_999_999_999,
  money: 9_999_999_999,
  unitCost: 99_999_999,
  weightG: 999_999_999,
  itemQuantity: 9_999_999,
};

export const passwordField = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres')
  .max(128, 'Senha muito longa');

export const emailField = z.string().trim().toLowerCase().email('E-mail inválido').max(254);
