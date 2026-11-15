import { Prisma } from '@prisma/client';
import { productCosting } from '@/services/product-costing';

const D = (v: number) => new Prisma.Decimal(v);
const ing = (name: string, cost: number | null) => ({
  name,
  costPerUnit: cost === null ? null : D(cost),
});

describe('productCosting', () => {
  it('produto por unidade: soma receita × custo', () => {
    const c = productCosting({
      pricingMode: 'UNIT',
      price: D(18),
      recipeItems: [
        { quantity: D(250), ingredient: ing('Açaí', 0.028) },
        { quantity: D(200), ingredient: ing('Leite', 0.005) },
        { quantity: D(1), ingredient: ing('Copo', 0.4) },
      ],
      weightMix: [],
    });
    // 7 + 1 + 0,40
    expect(c.cost?.toNumber()).toBe(8.4);
    expect(c.margin?.toNumber()).toBe(9.6);
    expect(c.marginPct).toBe(53.3);
    expect(c.basis).toBe('UNIT');
    expect(c.estimated).toBe(false);
  });

  it('produto por peso: custo de 1 kg pela composição média', () => {
    const c = productCosting({
      pricingMode: 'WEIGHT',
      price: D(59.9),
      recipeItems: [],
      weightMix: [
        { percentage: D(70), ingredient: ing('Açaí', 0.03) },
        { percentage: D(20), ingredient: ing('Creme', 0.05) },
      ],
    });
    // 700 g × 0,03 + 200 g × 0,05 = 21 + 10
    expect(c.cost?.toNumber()).toBe(31);
    expect(c.basis).toBe('KG');
    expect(c.coveragePct).toBe(90);
    expect(c.estimated).toBe(true);
  });

  it('ingrediente sem custo fica de fora e é avisado', () => {
    const c = productCosting({
      pricingMode: 'UNIT',
      price: D(10),
      recipeItems: [
        { quantity: D(100), ingredient: ing('Açaí', 0.03) },
        { quantity: D(1), ingredient: ing('Copo', null) },
      ],
      weightMix: [],
    });
    expect(c.cost?.toNumber()).toBe(3);
    expect(c.missingCost).toEqual(['Copo']);
  });

  it('sem receita/composição não inventa custo', () => {
    const c = productCosting({ pricingMode: 'UNIT', price: D(10), recipeItems: [], weightMix: [] });
    expect(c.cost).toBeNull();
    expect(c.margin).toBeNull();
  });

  it('preço zero não divide por zero', () => {
    const c = productCosting({
      pricingMode: 'UNIT',
      price: D(0),
      recipeItems: [{ quantity: D(1), ingredient: ing('X', 1) }],
      weightMix: [],
    });
    expect(c.marginPct).toBeNull();
  });
});
