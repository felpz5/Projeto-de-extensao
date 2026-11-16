import { Prisma } from '@prisma/client';
import {
  contentHash,
  normalizeName,
  parseDate,
  parseNumber,
  parseRows,
  parseTime,
  summarizeRows,
} from '@/services/sale-import-parser';

const products = [
  {
    id: 'p-peso',
    name: 'Açaí no Peso',
    pricingMode: 'WEIGHT' as const,
    price: new Prisma.Decimal(59.9),
  },
  { id: 'p-agua', name: 'Água 500 ml', pricingMode: 'UNIT' as const, price: new Prisma.Decimal(4) },
];
const limits = { minDay: '2021-01-01', maxDay: '2026-11-15' };
const defaults = { channel: 'IN_STORE' as const };

describe('conversão de valores do arquivo', () => {
  it('números em formato brasileiro e internacional', () => {
    expect(parseNumber('1.234,56')).toBe(1234.56);
    expect(parseNumber('R$ 12,50')).toBe(12.5);
    expect(parseNumber('12.5')).toBe(12.5);
    expect(parseNumber('1.500')).toBe(1500);
    expect(parseNumber('300')).toBe(300);
  });

  it('"0.500" é meio, não quinhentos (milhar nunca começa com zero)', () => {
    expect(parseNumber('0.500')).toBe(0.5);
    expect(parseNumber('12.500')).toBe(12500);
    expect(parseNumber('-1.500')).toBe(-1500);
  });

  it('recusa números ambíguos ou inválidos em vez de adivinhar', () => {
    expect(parseNumber('12,3,4')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });

  it('datas ISO e brasileiras; data inexistente é recusada', () => {
    expect(parseDate('2026-03-07')).toBe('2026-03-07');
    expect(parseDate('07/03/2026')).toBe('2026-03-07');
    expect(parseDate('7/3/2026')).toBe('2026-03-07');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('2026/03/07')).toBeNull();
  });

  it('hora opcional (padrão 12:00) e validada', () => {
    expect(parseTime(undefined)).toBe('12:00');
    expect(parseTime('9:05')).toBe('09:05');
    expect(parseTime('25:00')).toBeNull();
  });

  it('nome de produto sem acento, caixa ou espaços extras', () => {
    expect(normalizeName('  AÇAÍ   no peso ')).toBe('acai no peso');
  });
});

describe('parseRows (validação linha a linha)', () => {
  it('converte uma linha válida e encontra o produto pelo nome', () => {
    const { valid, errors } = parseRows(
      [{ line: 2, date: '10/11/2026', product: 'acai no peso', total: '25,00', payment: 'Pix' }],
      products,
      defaults,
      limits,
    );
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({
      day: '2026-11-10',
      time: '12:00',
      productId: 'p-peso',
      quantity: 1,
      total: 25,
      channel: 'IN_STORE',
      paymentMethod: 'PIX',
    });
  });

  it('aponta cada erro com a linha do arquivo (nada é corrigido em silêncio)', () => {
    const { valid, errors } = parseRows(
      [
        { line: 2, date: '2026-13-01', product: 'Água 500 ml' },
        { line: 3, date: '2026-11-16', product: 'Água 500 ml' }, // hoje: não pode
        { line: 4, date: '2019-01-01', product: 'Água 500 ml' }, // antigo demais
        { line: 5, date: '2026-11-01', product: 'Sorvete' }, // não existe
        { line: 6, date: '2026-11-01', product: 'Água 500 ml', quantity: '-2' },
        { line: 7, date: '2026-11-01', product: 'Açaí no peso' }, // peso: sem valor nem peso
        { line: 8, date: '2026-11-01', product: 'Água 500 ml', channel: 'telepatia' },
      ],
      products,
      defaults,
      limits,
    );
    expect(valid).toHaveLength(0);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(errors[1].message).toMatch(/anterior a hoje/);
    expect(errors[2].message).toMatch(/fora do período/);
    expect(errors[3].message).toMatch(/não encontrado/);
  });

  it('sem coluna de produto usa o produto padrão; sem valor usa o preço atual (e avisa)', () => {
    const { valid } = parseRows(
      [
        { line: 2, date: '2026-11-01', quantity: '3' },
        { line: 3, date: '2026-11-01', weightG: '500' },
      ],
      products,
      { ...defaults, productId: 'p-agua' },
      limits,
    );
    expect(valid[0]).toMatchObject({ productId: 'p-agua', total: 12, totalFromPrice: true });
    const peso = parseRows(
      [{ line: 2, date: '2026-11-01', weightG: '500' }],
      products,
      { ...defaults, productId: 'p-peso' },
      limits,
    ).valid[0];
    expect(peso.total).toBeCloseTo(29.95);
  });

  it('canal e pagamento aceitam variações de escrita (hífen, sublinhado, acento, caixa)', () => {
    const { valid, errors } = parseRows(
      [
        {
          line: 2,
          date: '2026-11-01',
          product: 'Água 500 ml',
          payment: 'Vale-refeição',
          channel: 'Balcão',
        },
        {
          line: 3,
          date: '2026-11-01',
          product: 'Água 500 ml',
          payment: 'CREDIT_CARD',
          channel: 'in_store',
        },
        {
          line: 4,
          date: '2026-11-01',
          product: 'Água 500 ml',
          payment: 'Cartão de Débito',
          channel: 'ONLINE',
        },
      ],
      products,
      defaults,
      limits,
    );
    expect(errors).toEqual([]);
    expect(valid.map((v) => [v.paymentMethod, v.channel])).toEqual([
      ['VOUCHER', 'IN_STORE'],
      ['CREDIT_CARD', 'IN_STORE'],
      ['DEBIT_CARD', 'ONLINE'],
    ]);
  });

  it('nome de produto repetido no cadastro é erro (não escolhe um ao acaso)', () => {
    const dup = [...products, { ...products[1], id: 'p-agua-2' }];
    const { errors } = parseRows(
      [{ line: 2, date: '2026-11-01', product: 'água 500 ml' }],
      dup,
      defaults,
      limits,
    );
    expect(errors[0].message).toMatch(/mais de um produto/);
  });
});

describe('summarizeRows e contentHash', () => {
  const { valid } = parseRows(
    [
      { line: 2, date: '2026-11-01', product: 'Água 500 ml', total: '4' },
      { line: 3, date: '2026-11-01', product: 'Água 500 ml', total: '4' },
      { line: 4, date: '2026-11-04', product: 'Açaí no peso', total: '20' },
    ],
    products,
    defaults,
    limits,
  );

  it('período, dias sem registro, linhas idênticas e totais por produto', () => {
    const s = summarizeRows(valid, products);
    expect(s.period).toEqual({
      first: '2026-11-01',
      last: '2026-11-04',
      days: 4,
      daysWithSales: 2,
      daysWithoutRows: 2,
    });
    expect(s.identicalRows).toBe(1);
    expect(s.totalAmount).toBe(28);
    expect(s.byProduct.find((p) => p.productId === 'p-agua')).toMatchObject({ rows: 2, amount: 8 });
  });

  it('o hash depende do conteúdo, não do nome do arquivo', () => {
    expect(contentHash(valid)).toBe(contentHash([...valid]));
    expect(contentHash(valid)).not.toBe(contentHash(valid.slice(1)));
  });
});
