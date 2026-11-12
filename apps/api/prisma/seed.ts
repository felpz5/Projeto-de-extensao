/**
 * Dados de demonstração: uma açaiteria com catálogo, estoque e ~60 dias de vendas.
 * Uso: npm run db:seed -w @gestock/api
 * Login: demo@gestock.app / gestock123  (troque em produção — este seed é só para desenvolvimento)
 */
import { Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { mergeConsumption, planSaleItem, ProductInfo } from '../src/modules/sales/consumption';

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60_000;
const DAYS = 60;
const EMAIL = 'demo@gestock.app';

/** Gerador pseudoaleatório com semente fixa: o seed gera sempre os mesmos dados. */
let state = 42;
const rand = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const between = (min: number, max: number) => min + rand() * (max - min);

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed de demonstração não roda em produção');

  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log(`Já existe o usuário ${EMAIL}. Nada a fazer.`);
    return;
  }

  const userId = randomUUID();
  const tenantId = randomUUID();
  const ctx = (tx: Prisma.TransactionClient) =>
    tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('app.user_id', ${userId}, true)`;

  const ids = await prisma.$transaction(async (tx) => {
    await ctx(tx);
    await tx.user.create({
      data: {
        id: userId,
        name: 'Conta Demo',
        email: EMAIL,
        passwordHash: await argon2.hash('gestock123', { type: argon2.argon2id }),
      },
    });
    await tx.tenant.create({
      data: { id: tenantId, name: 'Açaiteria Demo', slug: `acaiteria-demo-${tenantId.slice(0, 6)}`, segment: 'acaiteria' },
    });
    await tx.membership.create({ data: { tenantId, userId, role: 'OWNER' } });

    const cat = async (name: string, kind: 'PRODUCT' | 'INGREDIENT') =>
      (await tx.category.create({ data: { tenantId, name, kind } })).id;
    const bases = await cat('Bases', 'INGREDIENT');
    const cremes = await cat('Cremes', 'INGREDIENT');
    const compl = await cat('Complementos', 'INGREDIENT');
    const cobert = await cat('Coberturas', 'INGREDIENT');
    const potes = await cat('Potes', 'PRODUCT');
    const bebidas = await cat('Bebidas', 'PRODUCT');

    const ing = async (
      name: string,
      categoryId: string,
      baseUnit: 'G' | 'ML' | 'UN',
      minStock: number,
      cost: number,
      leadTimeDays: number,
      defaultPortion?: number,
    ) =>
      (
        await tx.ingredient.create({
          data: { tenantId, name, categoryId, baseUnit, minStock, costPerUnit: cost, leadTimeDays, defaultPortion },
        })
      ).id;

    const i = {
      acai: await ing('Açaí tradicional', bases, 'G', 8000, 0.028, 2),
      cupuacu: await ing('Creme de cupuaçu', cremes, 'G', 2000, 0.035, 3, 40),
      ninho: await ing('Creme de ninho', cremes, 'G', 2000, 0.04, 3, 40),
      granola: await ing('Granola', compl, 'G', 1500, 0.02, 5, 25),
      banana: await ing('Banana', compl, 'G', 2000, 0.008, 1, 50),
      leiteCond: await ing('Leite condensado', cobert, 'G', 1500, 0.025, 4, 20),
      pacoca: await ing('Paçoca', compl, 'G', 800, 0.03, 5, 15),
      leite: await ing('Leite integral', bases, 'ML', 3000, 0.005, 1),
      copo: await ing('Copo 500 ml', bases, 'UN', 100, 0.45, 7),
    };

    const peso = await tx.product.create({
      data: { tenantId, name: 'Açaí no peso', categoryId: potes, pricingMode: 'WEIGHT', price: 59.9 },
    });
    await tx.weightMixItem.createMany({
      data: [
        { tenantId, productId: peso.id, ingredientId: i.acai, percentage: 65 },
        { tenantId, productId: peso.id, ingredientId: i.ninho, percentage: 10 },
        { tenantId, productId: peso.id, ingredientId: i.cupuacu, percentage: 8 },
        { tenantId, productId: peso.id, ingredientId: i.granola, percentage: 7 },
        { tenantId, productId: peso.id, ingredientId: i.banana, percentage: 6 },
        { tenantId, productId: peso.id, ingredientId: i.leiteCond, percentage: 4 },
      ],
    });
    const shake = await tx.product.create({
      data: { tenantId, name: 'Milkshake de açaí 500 ml', categoryId: bebidas, pricingMode: 'UNIT', price: 18 },
    });
    await tx.recipeItem.createMany({
      data: [
        { tenantId, productId: shake.id, ingredientId: i.acai, quantity: 250 },
        { tenantId, productId: shake.id, ingredientId: i.leite, quantity: 200 },
        { tenantId, productId: shake.id, ingredientId: i.copo, quantity: 1 },
      ],
    });

    // Estoque inicial, 60 dias atrás.
    const start = new Date(Date.now() - DAYS * DAY);
    const initial: [string, number][] = [
      [i.acai, 60000], [i.cupuacu, 8000], [i.ninho, 9000], [i.granola, 6000], [i.banana, 7000],
      [i.leiteCond, 5000], [i.pacoca, 2000], [i.leite, 20000], [i.copo, 500],
    ];
    await tx.stockMovement.createMany({
      data: initial.map(([ingredientId, quantity]) => ({
        tenantId, ingredientId, type: 'INITIAL' as const, quantity, occurredAt: start, createdById: userId,
      })),
    });

    return { i, peso, shake, initial };
  });

  const ingredients = await prisma.$transaction(async (tx) => {
    await ctx(tx);
    return tx.ingredient.findMany({ where: { tenantId }, select: { id: true, defaultPortion: true } });
  });
  const ingMap = new Map(ingredients.map((x) => [x.id, x]));
  const pesoInfo: ProductInfo = {
    id: ids.peso.id, name: ids.peso.name, pricingMode: 'WEIGHT', price: ids.peso.price, recipe: [],
    weightMix: await prisma.$transaction(async (tx) => {
      await ctx(tx);
      return tx.weightMixItem.findMany({ where: { productId: ids.peso.id } });
    }),
  };
  const shakeInfo: ProductInfo = {
    id: ids.shake.id, name: ids.shake.name, pricingMode: 'UNIT', price: ids.shake.price, weightMix: [],
    recipe: await prisma.$transaction(async (tx) => {
      await ctx(tx);
      return tx.recipeItem.findMany({ where: { productId: ids.shake.id } });
    }),
  };
  const onlineOptions = [ids.i.ninho, ids.i.cupuacu, ids.i.granola, ids.i.banana, ids.i.leiteCond, ids.i.pacoca];

  const level = new Map<string, number>(ids.initial);
  const avgUse = new Map<string, number>();

  // Vendas: mais movimento no fim de semana e nos dias quentes (aleatório).
  for (let d = DAYS; d >= 1; d--) {
    const day = new Date(Date.now() - d * DAY);
    const weekend = [0, 5, 6].includes(day.getUTCDay());
    const orders = Math.round(between(weekend ? 35 : 18, weekend ? 55 : 30));

    const sales: Prisma.SaleCreateManyInput[] = [];
    const items: Prisma.SaleItemCreateManyInput[] = [];
    const itemIngr: Prisma.SaleItemIngredientCreateManyInput[] = [];
    const moves: Prisma.StockMovementCreateManyInput[] = [];

    for (let n = 0; n < orders; n++) {
      const saleId = randomUUID();
      const soldAt = new Date(day);
      soldAt.setUTCHours(15 + Math.floor(between(0, 9)), Math.floor(between(0, 60)));
      const online = rand() < 0.35;
      const isShake = rand() < 0.15;

      const plan = isShake
        ? planSaleItem({ productId: shakeInfo.id, quantity: 1 }, shakeInfo, ingMap)
        : online
          ? planSaleItem(
              {
                productId: pesoInfo.id,
                quantity: 1,
                unitPrice: [15, 20, 25, 30][Math.floor(between(0, 4))],
                ingredients: onlineOptions.filter(() => rand() < 0.45).map((ingredientId) => ({ ingredientId })),
              },
              pesoInfo,
              ingMap,
            )
          : planSaleItem({ productId: pesoInfo.id, quantity: 1, weightG: Math.round(between(250, 700)) }, pesoInfo, ingMap);

      sales.push({
        id: saleId, tenantId, channel: online ? 'ONLINE' : 'IN_STORE', soldAt,
        totalAmount: plan.unitPrice.mul(plan.quantity), totalWeightG: plan.weightG, createdById: userId,
      });
      const itemId = randomUUID();
      items.push({ id: itemId, tenantId, saleId, productId: plan.productId, quantity: plan.quantity, unitPrice: plan.unitPrice, weightG: plan.weightG });
      plan.ingredients.forEach((x) => itemIngr.push({ ...x, tenantId, saleItemId: itemId }));
      mergeConsumption([plan]).forEach((c) =>
        moves.push({
          tenantId, ingredientId: c.ingredientId, type: 'SALE_CONSUMPTION', quantity: c.quantity.negated(),
          occurredAt: soldAt, saleId, isEstimated: c.isEstimated, note: c.isEstimated ? `Estimativa (${c.source})` : null,
        }),
      );
    }

    // Atualiza saldo e consumo médio do dia.
    const usedToday = new Map<string, number>();
    for (const m of moves) {
      const q = Number(m.quantity);
      level.set(m.ingredientId, (level.get(m.ingredientId) ?? 0) + q);
      if (q < 0) usedToday.set(m.ingredientId, (usedToday.get(m.ingredientId) ?? 0) - q);
    }
    for (const [id] of level) {
      const prev = avgUse.get(id);
      const today = usedToday.get(id) ?? 0;
      avgUse.set(id, prev === undefined ? today : prev * 0.8 + today * 0.2);
    }

    // Reposição como uma loja faria: compra quando o saldo cobre menos de 4 dias.
    // Nos últimos 4 dias não há compras, para o painel mostrar alertas e sugestões.
    if (d > 4) {
      const restockAt = new Date(day.getTime() + DAY);
      restockAt.setUTCHours(12, 0, 0, 0);
      for (const [id, stock] of level) {
        const avg = avgUse.get(id) ?? 0;
        if (avg > 0 && stock < avg * 4) {
          const quantity = Math.ceil(avg * 10 - stock);
          moves.push({ tenantId, ingredientId: id, type: 'PURCHASE', quantity, occurredAt: restockAt, createdById: userId });
          level.set(id, stock + quantity);
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await ctx(tx);
      await tx.sale.createMany({ data: sales });
      await tx.saleItem.createMany({ data: items });
      if (itemIngr.length) await tx.saleItemIngredient.createMany({ data: itemIngr });
      await tx.stockMovement.createMany({ data: moves });
    });
  }

  console.log(`Seed concluído: "Açaiteria Demo" com ${DAYS} dias de vendas.`);
  console.log(`Login: ${EMAIL} / gestock123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
