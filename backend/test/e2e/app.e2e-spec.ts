/**
 * Testes ponta a ponta contra um Postgres real (com as migrations aplicadas).
 * Rode com DATABASE_URL apontando para o usuário gestock_app (sem BYPASSRLS):
 *   npm run test:e2e   (dentro de backend/)
 */
import type { Express } from 'express';
import request from 'supertest';
import type * as AppModule from '@/app';
import type * as Database from '@/config/database';
import { todayIn } from '@/utils/date';
import { sha256 } from '@/utils/token';

const run = process.env.DATABASE_URL ? describe : describe.skip;
const DAY = 24 * 60 * 60_000;

run('Gestock API (e2e)', () => {
  let app: Express;
  let prisma: typeof Database.prisma;
  let withContext: typeof Database.withContext;
  const suffix = Date.now();

  const A = { token: '', tenantId: '', cookie: '' };
  const B = { token: '', tenantId: '' };
  const ids: Record<string, string> = {};

  const api = () => request(app);
  const asA = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string) =>
    api()[method](`/api${url}`).set('Authorization', `Bearer ${A.token}`);
  const asB = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string) =>
    api()[method](`/api${url}`).set('Authorization', `Bearer ${B.token}`);

  beforeAll(async () => {
    // Carrega só aqui: sem DATABASE_URL a suíte é pulada antes de validar o ambiente.
    // require (não import()): o projeto é CommonJS e o import() dinâmico seguiria a resolução
    // de ESM, que não conhece o alias "@/".
    /* eslint-disable @typescript-eslint/no-require-imports */
    ({ app } = require('@/app') as typeof AppModule);
    ({ prisma, withContext } = require('@/config/database') as typeof Database);
    /* eslint-enable @typescript-eslint/no-require-imports */

    const ra = await api()
      .post('/api/auth/register')
      .send({
        name: 'Dona A',
        email: `a${suffix}@teste.com`,
        password: 'senha-forte-123',
        establishmentName: 'Açaí da Praça',
        segment: 'acaiteria',
      })
      .expect(201);
    A.token = ra.body.accessToken;
    A.tenantId = ra.body.tenant.id;
    A.cookie = [ra.headers['set-cookie']].flat()[0];

    const rb = await api()
      .post('/api/auth/register')
      .send({
        name: 'Dono B',
        email: `b${suffix}@teste.com`,
        password: 'senha-forte-456',
        establishmentName: 'Sorveteria B',
      })
      .expect(201);
    B.token = rb.body.accessToken;
    B.tenantId = rb.body.tenant.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('não expõe o refresh token no corpo e usa cookie httpOnly', () => {
    expect(A.cookie).toMatch(/gestock_rt=/);
    expect(A.cookie).toMatch(/HttpOnly/i);
  });

  it('rejeita requisições sem token', async () => {
    await api().get('/api/ingredients').expect(401);
  });

  it('monta o catálogo da açaiteria', async () => {
    const cat = await asA('post', '/categories')
      .send({ name: 'Bases', kind: 'INGREDIENT' })
      .expect(201);

    const acai = await asA('post', '/ingredients')
      .send({
        name: 'Açaí',
        baseUnit: 'G',
        categoryId: cat.body.id,
        minStock: 1000,
        leadTimeDays: 2,
        costPerUnit: 0.03,
      })
      .expect(201);
    const creme = await asA('post', '/ingredients')
      .send({ name: 'Creme de ninho', baseUnit: 'G', defaultPortion: 40 })
      .expect(201);
    const granola = await asA('post', '/ingredients')
      .send({ name: 'Granola', baseUnit: 'G' })
      .expect(201);
    const leite = await asA('post', '/ingredients')
      .send({ name: 'Leite', baseUnit: 'ML' })
      .expect(201);
    Object.assign(ids, {
      acai: acai.body.id,
      creme: creme.body.id,
      granola: granola.body.id,
      leite: leite.body.id,
    });

    const peso = await asA('post', '/products')
      .send({ name: 'Açaí no peso', pricingMode: 'WEIGHT', price: 59.9 })
      .expect(201);
    ids.peso = peso.body.id;
    await asA('put', `/products/${ids.peso}/weight-mix`)
      .send({
        items: [
          { ingredientId: ids.acai, percentage: 70 },
          { ingredientId: ids.creme, percentage: 30 },
        ],
      })
      .expect(200);

    // Ingrediente em ML não pode entrar na composição por peso.
    await asA('put', `/products/${ids.peso}/weight-mix`)
      .send({ items: [{ ingredientId: ids.leite, percentage: 10 }] })
      .expect(400);

    const shake = await asA('post', '/products')
      .send({ name: 'Milkshake 500ml', pricingMode: 'UNIT', price: 18 })
      .expect(201);
    ids.shake = shake.body.id;
    const withRecipe = await asA('put', `/products/${ids.shake}/recipe`)
      .send({
        items: [
          { ingredientId: ids.acai, quantity: 300 },
          { ingredientId: ids.leite, quantity: 200 },
        ],
      })
      .expect(200);
    expect(withRecipe.body.recipeItems).toHaveLength(2);
  });

  it('calcula custo e margem do produto (receita e composição por peso)', async () => {
    // Milkshake: 300 g de açaí × R$ 0,03 = R$ 9,00; leite sem custo cadastrado.
    const shake = await asA('get', `/products/${ids.shake}`).expect(200);
    expect(Number(shake.body.costing.cost)).toBe(9);
    expect(Number(shake.body.costing.margin)).toBe(9);
    expect(shake.body.costing.marginPct).toBe(50);
    expect(shake.body.costing.missingCost).toEqual(['Leite']);

    // Açaí no peso: 1 kg = 700 g de açaí × 0,03 = R$ 21,00 (creme sem custo).
    const peso = await asA('get', `/products/${ids.peso}`).expect(200);
    expect(peso.body.costing.basis).toBe('KG');
    expect(Number(peso.body.costing.cost)).toBe(21);
    expect(peso.body.costing.coveragePct).toBe(100);
    expect(peso.body.costing.estimated).toBe(true);

    const list = await asA('get', '/products').expect(200);
    expect(list.body.find((p: { id: string }) => p.id === ids.shake).costing.cost).toBe('9');
  });

  describe('isolamento entre estabelecimentos', () => {
    it('B não enxerga, não altera e não usa dados de A pela API', async () => {
      const list = await asB('get', '/ingredients').expect(200);
      expect(list.body).toHaveLength(0);

      await asB('get', `/ingredients/${ids.acai}`).expect(404);
      await asB('patch', `/ingredients/${ids.acai}`).send({ name: 'hack' }).expect(404);
      await asB('delete', `/products/${ids.peso}`).expect(404);
      await asB('post', '/inventory/movements')
        .send({ ingredientId: ids.acai, type: 'PURCHASE', quantity: 10 })
        .expect(404);
      await asB('post', '/sales')
        .send({ channel: 'IN_STORE', items: [{ productId: ids.peso, weightG: 300 }] })
        .expect(400);
    });

    it('o próprio banco (RLS) bloqueia mesmo sem filtro no código', async () => {
      // Consulta SEM where tenantId, no contexto de B: nada de A aparece.
      const seenByB = await withContext({ tenantId: B.tenantId }, (tx) => tx.ingredient.findMany());
      expect(seenByB).toHaveLength(0);

      // Sem contexto nenhum: nada aparece.
      expect(await prisma.ingredient.count()).toBe(0);
      expect(await prisma.tenant.count()).toBe(0);

      // B tentando gravar uma linha marcada como de A: o banco recusa.
      await expect(
        withContext({ tenantId: B.tenantId }, (tx) =>
          tx.category.create({ data: { tenantId: A.tenantId, name: 'invasão', kind: 'PRODUCT' } }),
        ),
      ).rejects.toThrow();

      // B tentando atualizar ingrediente de A: nenhuma linha afetada.
      const updated = await withContext({ tenantId: B.tenantId }, (tx) =>
        tx.ingredient.updateMany({ where: { id: ids.acai }, data: { name: 'hack' } }),
      );
      expect(updated.count).toBe(0);
    });

    it('token de B não dá acesso ao tenant de A ao trocar de estabelecimento', async () => {
      await asB('post', '/auth/switch-tenant').send({ tenantId: A.tenantId }).expect(403);
    });
  });

  describe('estoque e vendas', () => {
    it('lança estoque inicial e compra', async () => {
      await asA('post', '/inventory/movements')
        .send({ ingredientId: ids.acai, type: 'INITIAL', quantity: 5000 })
        .expect(201);
      await asA('post', '/inventory/movements')
        .send({ ingredientId: ids.creme, type: 'INITIAL', quantity: 2000 })
        .expect(201);
      await asA('post', '/inventory/movements')
        .send({ ingredientId: ids.leite, type: 'INITIAL', quantity: 3000 })
        .expect(201);
      // Estoque inicial duas vezes não é permitido.
      await asA('post', '/inventory/movements')
        .send({ ingredientId: ids.acai, type: 'INITIAL', quantity: 1 })
        .expect(400);

      const buy = await asA('post', '/inventory/movements')
        .send({ ingredientId: ids.acai, type: 'PURCHASE', quantity: 1000, unitCost: 0.025 })
        .expect(201);
      expect(Number(buy.body.stock)).toBe(6000);
    });

    it('venda presencial: valor + peso, baixa ESTIMADA pela composição, sem inventar ingredientes', async () => {
      const res = await asA('post', '/sales')
        .send({
          channel: 'IN_STORE',
          totalAmount: 29.95,
          totalWeightG: 500,
          items: [{ productId: ids.peso }],
        })
        .expect(201);
      expect(res.body.stockImpact).toEqual({
        exactMovements: 0,
        estimatedMovements: 2,
        unknownIngredients: 0,
      });
      expect(res.body.items[0].ingredients).toHaveLength(0);
      expect(Number(res.body.items[0].unitPrice)).toBeCloseTo(29.95);

      const acai = await asA('get', `/ingredients/${ids.acai}`).expect(200);
      expect(Number(acai.body.stock)).toBe(6000 - 350);
    });

    it('venda online: porção padrão vira estimativa, ingrediente sem porção fica UNKNOWN', async () => {
      const res = await asA('post', '/sales')
        .send({
          channel: 'ONLINE',
          totalAmount: 25,
          items: [
            {
              productId: ids.peso,
              unitPrice: 25,
              ingredients: [{ ingredientId: ids.creme }, { ingredientId: ids.granola }],
            },
          ],
        })
        .expect(201);
      const sources = res.body.items[0].ingredients
        .map((i: { quantitySource: string }) => i.quantitySource)
        .sort();
      expect(sources).toEqual(['STANDARD_PORTION', 'UNKNOWN']);
      expect(res.body.stockImpact.unknownIngredients).toBe(1);
    });

    it('produto com receita: baixa exata', async () => {
      const res = await asA('post', '/sales')
        .send({ channel: 'IN_STORE', items: [{ productId: ids.shake, quantity: 2 }] })
        .expect(201);
      expect(Number(res.body.totalAmount)).toBe(36);
      expect(res.body.stockImpact.exactMovements).toBe(2);
    });

    it('cancelar a venda estorna o estoque, mas a venda continua no histórico', async () => {
      const before = Number((await asA('get', `/ingredients/${ids.leite}`)).body.stock);
      const sale = await asA('post', '/sales')
        .send({ channel: 'IN_STORE', paymentMethod: 'CASH', items: [{ productId: ids.shake }] })
        .expect(201);
      expect(sale.body.paymentMethod).toBe('CASH');
      expect(Number((await asA('get', `/ingredients/${ids.leite}`)).body.stock)).toBe(before - 200);

      // Não existe mais exclusão: só cancelamento com motivo.
      await asA('delete', `/sales/${sale.body.id}`).expect(404);
      await asA('post', `/sales/${sale.body.id}/cancel`).send({ reason: '' }).expect(422);
      const canceled = await asA('post', `/sales/${sale.body.id}/cancel`)
        .send({ reason: 'Cliente desistiu' })
        .expect(200);
      expect(canceled.body.status).toBe('CANCELED');
      expect(canceled.body.cancelReason).toBe('Cliente desistiu');
      expect(Number((await asA('get', `/ingredients/${ids.leite}`)).body.stock)).toBe(before);

      // Continua no histórico, com o estorno das baixas; não dá para cancelar duas vezes.
      const detail = await asA('get', `/sales/${sale.body.id}`).expect(200);
      expect(detail.body.status).toBe('CANCELED');
      expect(detail.body.movements.some((m: { reversesId: string | null }) => m.reversesId)).toBe(
        true,
      );
      await asA('post', `/sales/${sale.body.id}/cancel`).send({ reason: 'De novo' }).expect(409);

      // Cancelada não conta como faturamento.
      const list = await asA('get', '/sales?status=CANCELED').expect(200);
      expect(list.body.items.map((s: { id: string }) => s.id)).toContain(sale.body.id);
    });

    it('corrigir a venda cancela a original e registra a nova ligada a ela, na mesma data', async () => {
      const original = await asA('post', '/sales')
        .send({
          channel: 'IN_STORE',
          paymentMethod: 'PIX',
          soldAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
          items: [{ productId: ids.shake, quantity: 3 }],
        })
        .expect(201);
      const fixed = await asA('post', `/sales/${original.body.id}/correct`)
        .send({ channel: 'IN_STORE', paymentMethod: 'PIX', items: [{ productId: ids.shake }] })
        .expect(201);
      expect(fixed.body.correctsId).toBe(original.body.id);
      expect(fixed.body.soldAt).toBe(original.body.soldAt);
      expect(Number(fixed.body.totalAmount)).toBe(18);
      const old = await asA('get', `/sales/${original.body.id}`).expect(200);
      expect(old.body.status).toBe('CANCELED');
    });

    it('contagem de inventário gera ajuste com a diferença', async () => {
      const res = await asA('post', '/inventory/counts')
        .send({ items: [{ ingredientId: ids.creme, countedQuantity: 1500 }] })
        .expect(201);
      expect(res.body.adjusted).toBe(1);
      const creme = await asA('get', `/ingredients/${ids.creme}`).expect(200);
      expect(Number(creme.body.stock)).toBe(1500);
    });

    it('contagem retroativa compara com o saldo daquele momento, não com o de agora', async () => {
      const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60_000).toISOString();
      const copo = await asA('post', '/ingredients')
        .send({ name: 'Copo', baseUnit: 'UN' })
        .expect(201);

      // 3h atrás: estoque inicial 100 · 1h atrás: compra de 50.
      await asA('post', '/inventory/movements')
        .send({
          ingredientId: copo.body.id,
          type: 'INITIAL',
          quantity: 100,
          occurredAt: hoursAgo(3),
        })
        .expect(201);
      await asA('post', '/inventory/movements')
        .send({
          ingredientId: copo.body.id,
          type: 'PURCHASE',
          quantity: 50,
          occurredAt: hoursAgo(1),
        })
        .expect(201);

      // Contagem feita 2h atrás (100 copos), digitada só agora: na hora o saldo batia.
      const res = await asA('post', '/inventory/counts')
        .send({
          items: [{ ingredientId: copo.body.id, countedQuantity: 100 }],
          occurredAt: hoursAgo(2),
        })
        .expect(201);
      expect(res.body.adjusted).toBe(0);
      expect(Number((await asA('get', `/ingredients/${copo.body.id}`)).body.stock)).toBe(150);

      // Desativa para não mudar as contagens de ingredientes dos testes seguintes.
      await asA('patch', `/ingredients/${copo.body.id}`).send({ active: false }).expect(200);
    });

    it('estorno desfaz um lançamento sem apagar o histórico', async () => {
      const before = Number((await asA('get', `/ingredients/${ids.leite}`)).body.stock);
      const buy = await asA('post', '/inventory/movements')
        .send({ ingredientId: ids.leite, type: 'PURCHASE', quantity: 100 })
        .expect(201);

      const rev = await asA('post', `/inventory/movements/${buy.body.movement.id}/reverse`)
        .send({})
        .expect(201);
      expect(Number(rev.body.stock)).toBe(before);
      expect(rev.body.reversal.reversesId).toBe(buy.body.movement.id);

      await asA('post', `/inventory/movements/${buy.body.movement.id}/reverse`)
        .send({})
        .expect(409);
      await asA('post', `/inventory/movements/${rev.body.reversal.id}/reverse`)
        .send({})
        .expect(400);
    });

    it('filtro só com o dia inclui o dia inteiro, no fuso do estabelecimento', async () => {
      const today = todayIn('America/Sao_Paulo');
      const res = await asA('get', `/sales?from=${today}&to=${today}`).expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(3);
    });

    it('rejeita data nula, data futura e números fora do limite do banco (422, não 500)', async () => {
      await asA('post', '/sales')
        .send({ channel: 'IN_STORE', soldAt: null, items: [{ productId: ids.shake }] })
        .expect(422);
      await asA('post', '/inventory/movements')
        .send({
          ingredientId: ids.leite,
          type: 'PURCHASE',
          quantity: 10,
          occurredAt: new Date(Date.now() + DAY).toISOString(),
        })
        .expect(422);
      await asA('post', '/inventory/movements')
        .send({ ingredientId: ids.leite, type: 'PURCHASE', quantity: 1e15 })
        .expect(422);
    });
  });

  describe('permissões', () => {
    let staffToken = '';

    it('dono adiciona funcionário', async () => {
      await asA('post', '/tenant/members')
        .send({
          email: `staff${suffix}@teste.com`,
          role: 'STAFF',
          name: 'Func',
          password: 'senha-provisoria-1',
        })
        .expect(201);
      const login = await api()
        .post('/api/auth/login')
        .send({ email: `staff${suffix}@teste.com`, password: 'senha-provisoria-1' })
        .expect(200);
      staffToken = login.body.accessToken;
      expect(login.body.tenant.id).toBe(A.tenantId);
      // Senha definida pelo dono é provisória: o front deve exigir a troca.
      expect(login.body.user.mustChangePassword).toBe(true);
    });

    it('funcionário troca a senha provisória', async () => {
      const res = await api()
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ currentPassword: 'senha-provisoria-1', newPassword: 'senha-nova-do-func' })
        .expect(200);
      expect(res.body.user.mustChangePassword).toBe(false);
      staffToken = res.body.accessToken;

      await api()
        .post('/api/auth/login')
        .send({ email: `staff${suffix}@teste.com`, password: 'senha-provisoria-1' })
        .expect(401);
      await api()
        .post('/api/auth/login')
        .send({ email: `staff${suffix}@teste.com`, password: 'senha-nova-do-func' })
        .expect(200);
    });

    it('funcionário registra venda e entrada, mas não vê relatórios nem faz saídas/ajustes', async () => {
      const auth = { Authorization: `Bearer ${staffToken}` };
      await api()
        .post('/api/sales')
        .set(auth)
        .send({ channel: 'IN_STORE', items: [{ productId: ids.shake }] })
        .expect(201);
      await api()
        .post('/api/inventory/movements')
        .set(auth)
        .send({ ingredientId: ids.acai, type: 'PURCHASE', quantity: 10 })
        .expect(201);
      await api().post('/api/ingredients').set(auth).send({ name: 'X', baseUnit: 'G' }).expect(403);
      // "Estoque inicial" a qualquer momento inflaria o saldo: só gerente/dono.
      for (const type of ['INITIAL', 'ADJUSTMENT', 'MANUAL_OUT', 'LOSS']) {
        await api()
          .post('/api/inventory/movements')
          .set(auth)
          .send({ ingredientId: ids.acai, type, quantity: type === 'ADJUSTMENT' ? -10 : 10 })
          .expect(403);
      }
      await api().get('/api/sales').set(auth).expect(403);
      await api().get('/api/sales/summary').set(auth).expect(403);
      await api().get('/api/forecast/reorder').set(auth).expect(403);
      await api().get('/api/tenant/members').set(auth).expect(403);

      const dash = await api().get('/api/dashboard').set(auth).expect(200);
      expect(dash.body.sales).toBeNull();
      expect(dash.body.topProducts).toBeNull();
      expect(dash.body.stock.totalIngredients).toBe(4);

      // Dados financeiros saem da resposta para o funcionário (não só da tela).
      expect(dash.body.stock.estimatedValue).toBeNull();
      const ingredients = await api().get('/api/ingredients').set(auth).expect(200);
      expect(ingredients.body.every((i: { costPerUnit: unknown }) => i.costPerUnit === null)).toBe(
        true,
      );
      const levels = await api().get('/api/inventory/levels').set(auth).expect(200);
      expect(levels.body.every((l: { stockValue: unknown }) => l.stockValue === null)).toBe(true);
      const product = await api().get(`/api/products/${ids.shake}`).set(auth).expect(200);
      expect(product.body.costing).toBeNull();
      await api().get('/api/inventory/report').set(auth).expect(403);
      await api().get('/api/tenant/audit').set(auth).expect(403);
    });

    it('funcionário vê o próprio caixa e corrige a própria venda só nos primeiros minutos', async () => {
      const auth = { Authorization: `Bearer ${staffToken}` };
      const mine = await api()
        .post('/api/sales')
        .set(auth)
        .send({ channel: 'IN_STORE', paymentMethod: 'PIX', items: [{ productId: ids.shake }] })
        .expect(201);
      expect(mine.body.editableUntil).toBeTruthy();
      const ownerSale = await asA('post', '/sales')
        .send({ channel: 'IN_STORE', paymentMethod: 'CASH', items: [{ productId: ids.shake }] })
        .expect(201);

      // Caixa: só as vendas dele, por forma de pagamento.
      const cash = await api().get('/api/sales/cash').set(auth).expect(200);
      const cashIds = cash.body.sales.map((s: { id: string }) => s.id);
      expect(cashIds).toContain(mine.body.id);
      expect(cashIds).not.toContain(ownerSale.body.id);
      expect(cash.body.byPayment.find((p: { method: string }) => p.method === 'PIX')).toBeTruthy();
      // Mesmo pedindo o caixa de outra pessoa, recebe o próprio.
      const forced = await api()
        .get(`/api/sales/cash?userId=${ownerSale.body.createdById}`)
        .set(auth)
        .expect(200);
      expect(forced.body.sales.map((s: { id: string }) => s.id)).not.toContain(ownerSale.body.id);

      // Venda de outra pessoa "não existe" para ele.
      await api().get(`/api/sales/${ownerSale.body.id}`).set(auth).expect(404);
      await api()
        .post(`/api/sales/${ownerSale.body.id}/cancel`)
        .set(auth)
        .send({ reason: 'Teste' })
        .expect(404);

      // Corrige a própria venda recém-registrada.
      const fixed = await api()
        .post(`/api/sales/${mine.body.id}/correct`)
        .set(auth)
        .send({
          channel: 'IN_STORE',
          paymentMethod: 'CASH',
          items: [{ productId: ids.shake, quantity: 2 }],
        })
        .expect(201);

      // Passado o prazo, só o gerente.
      await withContext({ tenantId: A.tenantId }, (tx) =>
        tx.sale.update({
          where: { id: fixed.body.id },
          data: { createdAt: new Date(Date.now() - 20 * 60_000) },
        }),
      );
      const late = await api()
        .post(`/api/sales/${fixed.body.id}/cancel`)
        .set(auth)
        .send({ reason: 'Erro' })
        .expect(403);
      expect(late.body.message).toMatch(/15 minutos/);
      await asA('post', `/sales/${fixed.body.id}/cancel`).send({ reason: 'Erro' }).expect(200);
    });

    it('dono redefine a senha de um funcionário que esqueceu a dele', async () => {
      const members = await asA('get', '/tenant/members').expect(200);
      const staff = members.body.find(
        (m: { user: { email: string } }) => m.user.email === `staff${suffix}@teste.com`,
      );
      await asA('post', `/tenant/members/${staff.user.id}/password`)
        .send({ password: 'provisoria-nova-2' })
        .expect(204);
      // Sessões antigas dele caem; a senha antiga não vale mais; a nova é provisória.
      await api()
        .post('/api/auth/login')
        .send({ email: `staff${suffix}@teste.com`, password: 'senha-nova-do-func' })
        .expect(401);
      const login = await api()
        .post('/api/auth/login')
        .send({ email: `staff${suffix}@teste.com`, password: 'provisoria-nova-2' })
        .expect(200);
      expect(login.body.user.mustChangePassword).toBe(true);
      staffToken = login.body.accessToken;
    });

    it('conta que já existe só entra no estabelecimento depois de aceitar o convite', async () => {
      const invite = await asA('post', '/tenant/members')
        .send({ email: `b${suffix}@teste.com`, role: 'MANAGER' })
        .expect(201);
      expect(invite.body.status).toBe('INVITED');

      // Ainda não tem acesso.
      await asB('post', '/auth/switch-tenant').send({ tenantId: A.tenantId }).expect(403);
      // O dono não pode "ativar" o convite por conta própria.
      await asA('patch', `/tenant/members/${invite.body.user.id}`)
        .send({ status: 'ACTIVE' })
        .expect(400);

      const me = await asB('get', '/auth/me').expect(200);
      expect(me.body.invitations.map((i: { tenant: { id: string } }) => i.tenant.id)).toEqual([
        A.tenantId,
      ]);

      await asB('post', `/auth/invitations/${A.tenantId}/accept`).expect(200);
      await asB('post', '/auth/switch-tenant').send({ tenantId: A.tenantId }).expect(200);
    });

    it('gerente adiciona e gerencia funcionário, mas não cria gerente nem mexe no dono', async () => {
      // B agora é gerente em A.
      const switched = await asB('post', '/auth/switch-tenant')
        .send({ tenantId: A.tenantId })
        .expect(200);
      const asManager = { Authorization: `Bearer ${switched.body.accessToken}` };
      const added = await api()
        .post('/api/tenant/members')
        .set(asManager)
        .send({
          email: `staff2${suffix}@teste.com`,
          role: 'STAFF',
          name: 'Func 2',
          password: 'provisoria-func-2',
        })
        .expect(201);
      await api()
        .post('/api/tenant/members')
        .set(asManager)
        .send({
          email: `ger${suffix}@teste.com`,
          role: 'MANAGER',
          name: 'Gerente Novo',
          password: 'senha-123-x',
        })
        .expect(403);
      await api()
        .patch(`/api/tenant/members/${added.body.user.id}`)
        .set(asManager)
        .send({ role: 'MANAGER' })
        .expect(403);
      await api()
        .post(`/api/tenant/members/${added.body.user.id}/password`)
        .set(asManager)
        .send({ password: 'outra-provisoria-3' })
        .expect(204);
    });

    it('não redefine a senha de conta usada em outro estabelecimento', async () => {
      // B é dono do próprio estabelecimento: o dono de A não pode trocar a senha dele.
      const members = await asA('get', '/tenant/members').expect(200);
      const b = members.body.find(
        (m: { user: { email: string } }) => m.user.email === `b${suffix}@teste.com`,
      );
      await asA('post', `/tenant/members/${b.user.id}/password`)
        .send({ password: 'tomei-a-conta-1' })
        .expect(409);
    });

    it('edita o próprio perfil; trocar o e-mail exige a senha atual', async () => {
      const auth = { Authorization: `Bearer ${staffToken}` };
      const renamed = await api().patch('/api/auth/me').set(auth).send({ name: 'Func Novo' });
      expect(renamed.status).toBe(200);
      expect(renamed.body.name).toBe('Func Novo');
      await api()
        .patch('/api/auth/me')
        .set(auth)
        .send({ email: `novo${suffix}@teste.com` })
        .expect(422);
      await api()
        .patch('/api/auth/me')
        .set(auth)
        .send({ email: `novo${suffix}@teste.com`, currentPassword: 'errada-123' })
        .expect(400);
      await api()
        .patch('/api/auth/me')
        .set(auth)
        .send({ email: `a${suffix}@teste.com`, currentPassword: 'provisoria-nova-2' })
        .expect(409);
    });

    it('auditoria mostra quem cancelou venda e redefiniu senha', async () => {
      const audit = await asA('get', '/tenant/audit').expect(200);
      const actions = audit.body.items.map((i: { action: string }) => i.action);
      expect(actions).toEqual(expect.arrayContaining(['sale.cancel', 'member.reset_password']));
      expect(audit.body.items[0].userName).toBeTruthy();
    });
  });

  describe('previsão e dashboard', () => {
    it('com histórico, prevê demanda e sugere reposição como estimativa', async () => {
      // 21 dias de vendas passadas (fim de semana vende mais).
      for (let d = 21; d >= 1; d--) {
        const soldAt = new Date(Date.now() - d * DAY);
        const weekend = [0, 6].includes(soldAt.getUTCDay());
        await asA('post', '/sales')
          .send({
            channel: 'IN_STORE',
            soldAt: soldAt.toISOString(),
            totalWeightG: weekend ? 800 : 400,
            items: [{ productId: ids.peso }],
          })
          .expect(201);
      }

      const products = await asA('get', '/forecast/products?horizonDays=7').expect(200);
      expect(products.body.disclaimer).toMatch(/estimativas/i);
      const peso = products.body.items.find(
        (i: { product: { id: string } }) => i.product.id === ids.peso,
      );
      expect(peso.forecast.status).toBe('OK');
      expect(peso.forecast.historyLevel).toBe('SHORT');
      expect(peso.forecast).not.toHaveProperty('confidence');
      expect(peso.forecast.daily).toHaveLength(7);
      // precisão medida fora da amostra vem junto (com 21 dias: preliminar)
      expect(['LIMITED', 'SUFFICIENT', 'INSUFFICIENT']).toContain(peso.accuracy.evidence);
      expect(Array.isArray(peso.warnings)).toBe(true);

      const reorder = await asA('get', '/forecast/reorder?coverageDays=7').expect(200);
      const acai = reorder.body.items.find(
        (i: { ingredient: { id: string } }) => i.ingredient.id === ids.acai,
      );
      expect(acai.usesEstimatedData).toBe(true);
      expect(acai.forecast.status).toBe('OK');
      expect(acai.recommendation.suggestedQuantity).toBeGreaterThanOrEqual(0);
      expect(typeof acai.recommendation.explanation).toBe('string');

      const granola = reorder.body.items.find(
        (i: { ingredient: { id: string } }) => i.ingredient.id === ids.granola,
      );
      expect(granola.recommendation.urgency).toMatch(/NO_HISTORY/);
    });

    it('dashboard traz vendas, ranking, estoque e sugestões', async () => {
      const res = await asA('get', '/dashboard').expect(200);
      expect(res.body.sales.orders).toBeGreaterThan(20);
      expect(res.body.topProducts[0].productId).toBe(ids.peso);
      expect(res.body.stock.totalIngredients).toBe(4);
      expect(res.body.recentMovements.length).toBeGreaterThan(0);
      expect(res.body.sales.byDay.length).toBeGreaterThan(0);
    });

    it('resumo traz lucro bruto estimado e vendas por forma de pagamento', async () => {
      const res = await asA('get', '/sales/summary').expect(200);
      expect(Number(res.body.estimatedCost)).toBeGreaterThan(0);
      expect(Number(res.body.grossProfit)).toBeCloseTo(
        Number(res.body.revenue) - Number(res.body.estimatedCost),
        2,
      );
      expect(res.body.byPayment.length).toBeGreaterThan(0);
    });

    it('relatório de perdas/ajustes e histórico de contagens', async () => {
      const report = await asA('get', '/inventory/report').expect(200);
      const acai = report.body.items.find(
        (i: { ingredientId: string }) => i.ingredientId === ids.acai,
      );
      expect(acai.consumed).toBeGreaterThan(0);
      expect(acai.consumedEstimated).toBeGreaterThan(0);

      const counts = await asA('get', '/inventory/counts').expect(200);
      expect(counts.body.total).toBeGreaterThan(0);
      expect(counts.body.items[0].items[0]).toHaveProperty('difference');
      expect(counts.body.items[0].userName).toBeTruthy();
    });

    it('"minhas lojas" resume só os estabelecimentos em que a pessoa é dona ou gerente', async () => {
      const res = await asB('get', '/auth/stores').expect(200);
      const ids = res.body.stores.map((s: { tenant: { id: string } }) => s.tenant.id);
      expect(ids).toEqual(expect.arrayContaining([A.tenantId, B.tenantId]));
      const a = res.body.stores.find((s: { tenant: { id: string } }) => s.tenant.id === A.tenantId);
      expect(a.role).toBe('MANAGER');
      expect(a.period.orders).toBeGreaterThan(0);
    });
  });

  describe('precisão da previsão (backtesting) e importação de histórico', () => {
    const iso = (daysAgo: number) => {
      const today = todayIn('America/Sao_Paulo');
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    };
    // 70..41 dias atrás: período sem outras vendas (as dos testes anteriores são mais recentes)
    const rows = Array.from({ length: 30 }, (_, i) => {
      const qty = 10 + (i % 7 === 5 ? 8 : 0);
      return {
        line: i + 2,
        date: iso(70 - i),
        product: 'Água mineral',
        quantity: String(qty),
        total: `${qty * 4},00`,
        payment: 'Pix',
      };
    });
    let importId = '';
    let staffAuth = { Authorization: '' };

    it('prepara: produto e funcionário', async () => {
      const agua = await asA('post', '/products')
        .send({ name: 'Água mineral', pricingMode: 'UNIT', price: 4 })
        .expect(201);
      ids.agua = agua.body.id;
      // receita fixa: 1 garrafa por água (o histórico importado estima o consumo por ela)
      const garrafa = await asA('post', '/ingredients')
        .send({ name: 'Garrafa PET', baseUnit: 'UN', leadTimeDays: 3 })
        .expect(201);
      ids.garrafa = garrafa.body.id;
      await asA('put', `/products/${ids.agua}/recipe`)
        .send({ items: [{ ingredientId: ids.garrafa, quantity: 1 }] })
        .expect(200);
      await asA('post', '/tenant/members')
        .send({
          email: `staff-imp${suffix}@teste.com`,
          role: 'STAFF',
          name: 'Func Imp',
          password: 'senha-provisoria-9',
        })
        .expect(201);
      const login = await api()
        .post('/api/auth/login')
        .send({ email: `staff-imp${suffix}@teste.com`, password: 'senha-provisoria-9' })
        .expect(200);
      staffAuth = { Authorization: `Bearer ${login.body.accessToken}` };
    });

    it('funcionário não importa histórico (403)', async () => {
      await api()
        .post('/api/sales/import/preview')
        .set(staffAuth)
        .send({ fileName: 'x.csv', rows })
        .expect(403);
    });

    it('pré-visualização aponta erros por linha e não grava nada', async () => {
      const bad = [...rows.slice(0, 2), { line: 99, date: '31/02/2026', product: 'Água mineral' }];
      const res = await asA('post', '/sales/import/preview')
        .send({ fileName: 'ruim.csv', rows: bad })
        .expect(200);
      expect(res.body.canImport).toBe(false);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ line: 99, message: expect.stringMatching(/Data inválida/) }),
      ]);
      await asA('post', '/sales/import').send({ fileName: 'ruim.csv', rows: bad }).expect(422);
      const imports = await asA('get', '/sales/imports').expect(200);
      expect(imports.body).toHaveLength(0);
    });

    it('importa o histórico (tudo numa transação) SEM mexer no estoque atual', async () => {
      const before = await asA('get', '/inventory/levels').expect(200);
      const preview = await asA('post', '/sales/import/preview')
        .send({ fileName: 'caderno.csv', rows })
        .expect(200);
      expect(preview.body.canImport).toBe(true);
      expect(preview.body.summary.period.days).toBe(30);

      const res = await asA('post', '/sales/import')
        .send({ fileName: 'caderno.csv', rows })
        .expect(201);
      expect(res.body.imported).toBe(30);
      importId = res.body.id;

      const after = await asA('get', '/inventory/levels').expect(200);
      const qty = (b: { body: { ingredientId: string; quantity: string }[] }) =>
        Object.fromEntries(b.body.map((l) => [l.ingredientId, String(l.quantity)]));
      expect(qty(after)).toEqual(qty(before));
    });

    it('o histórico importado estima o consumo do ingrediente pela receita (só na previsão)', async () => {
      const reorder = await asA('get', '/forecast/reorder?coverageDays=7').expect(200);
      const garrafa = reorder.body.items.find(
        (i: { ingredient: { id: string } }) => i.ingredient.id === ids.garrafa,
      );
      expect(garrafa.stock).toBe(0); // nada entrou no estoque
      expect(garrafa.usesEstimatedData).toBe(true);
      // sem o histórico importado não haveria série; com ele, começa 70 dias atrás
      expect(garrafa.forecast.status).toBe('OK');
      expect(garrafa.forecast.historyDays).toBeGreaterThanOrEqual(69);
      // as vendas importadas pararam há 40 dias: previsão perto de zero é o resultado honesto
      expect(garrafa.forecast.averageDaily).toBeGreaterThanOrEqual(0);
    });

    it('o mesmo conteúdo não entra duas vezes (409)', async () => {
      const res = await asA('post', '/sales/import')
        .send({ fileName: 'outro-nome.csv', rows })
        .expect(409);
      expect(res.body.code).toBe('IMPORT_DUPLICATE');
    });

    it('período que já tem vendas exige confirmação explícita', async () => {
      const extra = [{ line: 2, date: iso(60), product: 'Água mineral', quantity: '1' }];
      const res = await asA('post', '/sales/import')
        .send({ fileName: 'extra.csv', rows: extra })
        .expect(409);
      expect(res.body.code).toBe('IMPORT_OVERLAP');
      await asA('post', '/sales/import')
        .send({ fileName: 'extra.csv', rows: extra, allowOverlap: true })
        .expect(201);
    });

    it('venda importada não pode ser corrigida (evitaria baixa de estoque com data antiga)', async () => {
      const list = await asA('get', `/sales?productId=${ids.agua}&status=COMPLETED&take=1`).expect(
        200,
      );
      const sale = list.body.items[0];
      expect(sale.source).toBe('IMPORT');
      await asA('post', `/sales/${sale.id}/correct`)
        .send({ channel: 'IN_STORE', items: [{ productId: ids.agua }] })
        .expect(409);
    });

    it('outro estabelecimento não vê nem desfaz a importação (RLS)', async () => {
      const list = await asB('get', '/sales/imports').expect(200);
      expect(list.body).toHaveLength(0);
      await asB('post', `/sales/imports/${importId}/undo`).expect(404);
      await asB('get', `/forecast/products/${ids.agua}`).expect(404);
    });

    it('detalhe do produto: histórico, previsão, backtesting com 4 modelos e explicação', async () => {
      const res = await asA(
        'get',
        `/forecast/products/${ids.agua}?horizonDays=7&lookbackDays=120`,
      ).expect(200);
      expect(res.body.importedShare).toBe(1);
      expect(res.body.history.length).toBeGreaterThanOrEqual(30);
      expect(res.body.forecast.status).toBe('OK');
      expect(Object.keys(res.body.evaluation.models).sort()).toEqual(
        ['gestock', 'holt-winters', 'naive', 'seasonal-naive'].sort(),
      );
      const h7 = res.body.evaluation.models.gestock.find(
        (h: { horizon: number }) => h.horizon === 7,
      );
      expect(h7.origins).toBeGreaterThan(0);
      expect(h7.daily.mae).not.toBeNull();
      expect(h7).not.toHaveProperty('sums');
      expect(res.body.explanation.join(' ')).toMatch(/média ponderada/);
      await asA('get', '/forecast/products/nao-e-uuid').expect(422);
    });

    it('relatório de precisão separa as unidades e informa a origem dos dados', async () => {
      const res = await asA('get', '/forecast/accuracy?lookbackDays=120').expect(200);
      expect(res.body.isDemo).toBe(false);
      expect(res.body.dataSource).toBe('REGISTERED_AND_IMPORTED');
      const keys = res.body.groups.map((g: { key: string }) => g.key);
      expect(keys).toEqual(
        expect.arrayContaining(['store-orders', 'product-units', 'product-sales']),
      );
      const units = res.body.groups.find((g: { key: string }) => g.key === 'product-units');
      const h7 = units.byHorizon.find((h: { horizon: number }) => h.horizon === 7);
      expect(h7.models.map((m: { model: string }) => m.model)).toEqual([
        'gestock',
        'naive',
        'seasonal-naive',
        'holt-winters',
      ]);
      await api().get('/api/forecast/accuracy').set(staffAuth).expect(403);
    });

    it('desfazer cancela as vendas do lote (nada é apagado) e libera reimportar', async () => {
      const res = await asA('post', `/sales/imports/${importId}/undo`).expect(200);
      expect(res.body.canceled).toBe(30);
      await asA('post', `/sales/imports/${importId}/undo`).expect(409);
      const canceled = await asA(
        'get',
        `/sales?productId=${ids.agua}&status=CANCELED&take=1`,
      ).expect(200);
      expect(canceled.body.total).toBe(30);
      expect(canceled.body.items[0].cancelReason).toBe('Importação desfeita');
      await asA('post', '/sales/import')
        .send({ fileName: 'caderno.csv', rows, allowOverlap: true })
        .expect(201);
    });

    it('resumo de vendas compara com o período anterior', async () => {
      const res = await asA('get', '/sales/summary').expect(200);
      expect(res.body.previous).toHaveProperty('revenue');
      expect(res.body.previous).toHaveProperty('revenueChangePct');
    });

    it('vendas importadas (sem custo registrado) ficam fora do lucro bruto e da margem', async () => {
      const res = await asA('get', `/sales/summary?from=${iso(75)}&to=${iso(1)}`).expect(200);
      const revenue = Number(res.body.revenue);
      const imported = Number(res.body.importedRevenue);
      expect(imported).toBeGreaterThan(0);
      expect(res.body.importedOrders).toBeGreaterThan(0);
      expect(Number(res.body.costedRevenue)).toBeCloseTo(revenue - imported, 2);
      expect(Number(res.body.grossProfit)).toBeCloseTo(
        revenue - imported - Number(res.body.estimatedCost),
        2,
      );
    });
  });

  describe('sessão', () => {
    it('refresh rotaciona o token; duas abas renovando juntas não derrubam a sessão', async () => {
      const first = await api().post('/api/auth/refresh').set('Cookie', A.cookie).expect(200);
      const newCookie = [first.headers['set-cookie']].flat()[0];
      expect(first.body.accessToken).toBeTruthy();

      // Segunda aba com o cookie antigo, logo em seguida: corrida, não roubo.
      const race = await api().post('/api/auth/refresh').set('Cookie', A.cookie).expect(409);
      expect(race.body.code).toBe('REFRESH_RACE');
      expect(race.headers['set-cookie']).toBeUndefined(); // não apaga o cookie novo

      const second = await api().post('/api/auth/refresh').set('Cookie', newCookie).expect(200);
      A.cookie = [second.headers['set-cookie']].flat()[0];
    });

    it('reuso de token antigo (fora da janela de corrida) derruba todas as sessões', async () => {
      const old = A.cookie;
      const next = await api().post('/api/auth/refresh').set('Cookie', old).expect(200);
      const latest = [next.headers['set-cookie']].flat()[0];

      // Simula que o token antigo foi revogado há 1 minuto.
      const raw = old.split(';')[0].split('=')[1];
      await prisma.refreshToken.updateMany({
        where: { tokenHash: sha256(raw) },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });

      await api().post('/api/auth/refresh').set('Cookie', old).expect(401); // reuso
      await api().post('/api/auth/refresh').set('Cookie', latest).expect(401); // família revogada
    });

    it('bloqueia o login após 5 senhas erradas sem revelar o bloqueio a quem não sabe a senha', async () => {
      const email = `b${suffix}@teste.com`;
      for (let i = 0; i < 5; i++) {
        await api().post('/api/auth/login').send({ email, password: 'errada-123' }).expect(401);
      }
      const wrong = await api()
        .post('/api/auth/login')
        .send({ email, password: 'errada-123' })
        .expect(401);
      expect(wrong.body.message).toBe('E-mail ou senha incorretos');

      const locked = await api()
        .post('/api/auth/login')
        .send({ email, password: 'senha-forte-456' })
        .expect(401);
      expect(locked.body.message).toMatch(/tentativas/);
    });

    it('e-mail inexistente responde igual a senha errada', async () => {
      const res = await api()
        .post('/api/auth/login')
        .send({ email: `ninguem${suffix}@teste.com`, password: 'x' })
        .expect(401);
      expect(res.body.message).toBe('E-mail ou senha incorretos');
    });
  });
});
