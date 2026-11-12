import { Prisma } from '@prisma/client';
import { IngredientInfo, mergeConsumption, planSaleItem, ProductInfo } from './consumption';

const D = (v: number) => new Prisma.Decimal(v);

const acaiPeso: ProductInfo = {
  id: 'p-peso',
  name: 'Açaí no peso',
  pricingMode: 'WEIGHT',
  price: D(59.9), // R$/kg
  recipe: [],
  weightMix: [
    { ingredientId: 'acai', percentage: D(70) },
    { ingredientId: 'creme', percentage: D(30) },
  ],
};

const milkshake: ProductInfo = {
  id: 'p-shake',
  name: 'Milkshake 500ml',
  pricingMode: 'UNIT',
  price: D(18),
  recipe: [
    { ingredientId: 'acai', quantity: D(300) },
    { ingredientId: 'leite', quantity: D(200) },
  ],
  weightMix: [],
};

const ingredients = new Map<string, IngredientInfo>([
  ['acai', { id: 'acai', defaultPortion: null }],
  ['creme', { id: 'creme', defaultPortion: D(40) }],
  ['granola', { id: 'granola', defaultPortion: null }],
  ['leite', { id: 'leite', defaultPortion: null }],
]);

describe('planSaleItem', () => {
  it('venda presencial por peso: calcula preço e baixa ESTIMADA pela composição, sem registrar ingredientes', () => {
    const plan = planSaleItem({ productId: 'p-peso', quantity: 1, weightG: 500 }, acaiPeso, ingredients);

    expect(plan.unitPrice.toNumber()).toBeCloseTo(29.95);
    expect(plan.ingredients).toHaveLength(0);
    expect(plan.consumption.map((c) => [c.ingredientId, c.quantity.toNumber(), c.isEstimated])).toEqual([
      ['acai', 350, true],
      ['creme', 150, true],
    ]);
  });

  it('venda presencial por peso sem composição configurada: nenhuma baixa', () => {
    const plan = planSaleItem(
      { productId: 'p-peso', quantity: 1, weightG: 500 },
      { ...acaiPeso, weightMix: [] },
      ingredients,
    );
    expect(plan.consumption).toHaveLength(0);
  });

  it('usa o peso total da venda quando o item não tem peso próprio', () => {
    const plan = planSaleItem({ productId: 'p-peso', quantity: 1, unitPrice: 20 }, acaiPeso, ingredients, 400);
    expect(plan.unitPrice.toNumber()).toBe(20);
    expect(plan.consumption[0].quantity.toNumber()).toBe(280);
  });

  it('produto por peso sem peso nem valor gera erro', () => {
    expect(() => planSaleItem({ productId: 'p-peso', quantity: 1 }, acaiPeso, ingredients)).toThrow();
  });

  it('pedido online: medido é exato, porção padrão é estimada, sem porção fica UNKNOWN e não baixa', () => {
    const plan = planSaleItem(
      {
        productId: 'p-peso',
        quantity: 1,
        unitPrice: 25,
        ingredients: [
          { ingredientId: 'acai', quantity: 300 },
          { ingredientId: 'creme' },
          { ingredientId: 'granola' },
        ],
      },
      acaiPeso,
      ingredients,
    );

    expect(plan.ingredients.map((i) => [i.ingredientId, i.quantitySource, i.quantity?.toNumber() ?? null])).toEqual([
      ['acai', 'MEASURED', 300],
      ['creme', 'STANDARD_PORTION', 40],
      ['granola', 'UNKNOWN', null],
    ]);
    expect(plan.consumption.map((c) => [c.ingredientId, c.isEstimated])).toEqual([
      ['acai', false],
      ['creme', true],
    ]);
  });

  it('produto com receita fixa: baixa exata multiplicada pela quantidade', () => {
    const plan = planSaleItem({ productId: 'p-shake', quantity: 2 }, milkshake, ingredients);

    expect(plan.unitPrice.toNumber()).toBe(18);
    expect(plan.consumption.map((c) => [c.ingredientId, c.quantity.toNumber(), c.isEstimated])).toEqual([
      ['acai', 600, false],
      ['leite', 400, false],
    ]);
    expect(plan.ingredients.every((i) => i.quantitySource === 'RECIPE')).toBe(true);
  });
});

describe('mergeConsumption', () => {
  it('soma por ingrediente e mantém exato separado de estimado', () => {
    const a = planSaleItem({ productId: 'p-shake', quantity: 1 }, milkshake, ingredients);
    const b = planSaleItem({ productId: 'p-peso', quantity: 1, weightG: 1000 }, acaiPeso, ingredients);
    const merged = mergeConsumption([a, b]);

    const acai = merged.filter((m) => m.ingredientId === 'acai');
    expect(acai).toHaveLength(2);
    expect(acai.find((m) => !m.isEstimated)?.quantity.toNumber()).toBe(300);
    expect(acai.find((m) => m.isEstimated)?.quantity.toNumber()).toBe(700);
  });
});
