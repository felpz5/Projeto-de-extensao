import { describe, expect, it } from 'vitest';
import { formatQty, formatSignedQty, localInputToIso, toNumber } from './format';
import { numberField, optionalNumberField, parseNum, toInput } from './schemas';

describe('parseNum', () => {
  it('aceita vírgula e ponto como separador decimal', () => {
    expect(parseNum('1,5')).toBe(1.5);
    expect(parseNum('1.5')).toBe(1.5);
    expect(parseNum(' 350 ')).toBe(350);
    expect(parseNum('-500')).toBe(-500);
  });

  it('entende o ponto como separador de milhar do pt-BR', () => {
    expect(parseNum('1.500')).toBe(1500);
    expect(parseNum('12.000.000')).toBe(12_000_000);
    expect(parseNum('1.234,5')).toBe(1234.5);
    expect(parseNum('-1.500')).toBe(-1500);
    // decimais "à americana" que não parecem milhar continuam decimais
    expect(parseNum('0.028')).toBe(0.028);
    expect(parseNum('2.5')).toBe(2.5);
    expect(parseNum('59.90')).toBe(59.9);
  });

  it('aceita o sinal de menos do teclado do celular', () => {
    expect(parseNum('−500')).toBe(-500);
  });

  it('recusa lixo que Number() aceitaria', () => {
    expect(parseNum('1e5')).toBeUndefined();
    expect(parseNum('0x10')).toBeUndefined();
    expect(parseNum('1,2,3')).toBeUndefined();
  });

  it('toInput devolve com vírgula e é lido de volta igual', () => {
    for (const v of ['0.028', '1.125', '8000', '59.9', 1.5]) {
      expect(parseNum(toInput(v))).toBe(Number(v));
    }
    expect(toInput(null)).toBe('');
  });

  it('campo vazio ou inválido vira undefined (nunca 0 escondido)', () => {
    expect(parseNum('')).toBeUndefined();
    expect(parseNum('   ')).toBeUndefined();
    expect(parseNum('abc')).toBeUndefined();
    expect(parseNum(undefined)).toBeUndefined();
  });
});

describe('numberField / optionalNumberField', () => {
  it('obrigatório recusa vazio e respeita os limites', () => {
    expect(numberField().safeParse('').success).toBe(false);
    expect(numberField({ positive: true }).safeParse('0').success).toBe(false);
    expect(numberField({ max: 10 }).safeParse('11').success).toBe(false);
    expect(numberField({ integer: true }).safeParse('1,5').success).toBe(false);
    expect(numberField({ min: 0 }).safeParse('2,5').success).toBe(true);
  });

  it('opcional aceita vazio mas valida quando preenchido', () => {
    expect(optionalNumberField().safeParse('').success).toBe(true);
    expect(optionalNumberField({ positive: true }).safeParse('-1').success).toBe(false);
    expect(optionalNumberField().safeParse('x').success).toBe(false);
  });
});

describe('formatQty', () => {
  it('converte g → kg e ml → L a partir de 1000', () => {
    expect(formatQty('38349.4', 'G')).toBe('38,35 kg');
    expect(formatQty(2500, 'ML')).toBe('2,5 L');
    expect(formatQty(40, 'G')).toBe('40 g');
  });

  it('unidades nunca são convertidas', () => {
    expect(formatQty(1500, 'UN')).toBe('1.500 un');
  });

  it('não esconde frações pequenas', () => {
    expect(formatQty(0.5, 'UN')).toBe('0,5 un');
    expect(formatQty(0.25, 'G')).toBe('0,25 g');
  });

  it('mostra o sinal das movimentações', () => {
    expect(formatSignedQty('-15', 'G')).toBe('−15 g');
    expect(formatSignedQty('5000', 'G')).toBe('+5 kg');
  });
});

describe('toNumber', () => {
  it('converte decimais em texto vindos da API', () => {
    expect(toNumber('24773.53')).toBe(24773.53);
    expect(toNumber(null)).toBe(0);
    expect(toNumber('')).toBe(0);
  });
});

describe('localInputToIso', () => {
  it('gera ISO 8601 com fuso, como a API exige', () => {
    expect(localInputToIso('2026-11-14T10:30')).toMatch(/^2026-11-1\dT\d\d:30:00\.000Z$/);
  });
});
