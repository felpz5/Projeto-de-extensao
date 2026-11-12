/**
 * Testes ponta a ponta contra um Postgres real (com as migrations aplicadas).
 * Rode com DATABASE_URL apontando para o usuário gestock_app (sem BYPASSRLS):
 *   npm run test:e2e -w @gestock/api
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';

const run = process.env.DATABASE_URL ? describe : describe.skip;
const DAY = 24 * 60 * 60_000;

run('Gestock API (e2e)', () => {
  let app: INestApplication;
  let db: PrismaService;
  const suffix = Date.now();

  const A = { token: '', tenantId: '', cookie: '' };
  const B = { token: '', tenantId: '' };
  const ids: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const asA = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string) =>
    api()[method](`/api${url}`).set('Authorization', `Bearer ${A.token}`);
  const asB = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string) =>
    api()[method](`/api${url}`).set('Authorization', `Bearer ${B.token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();
    db = app.get(PrismaService);

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
    await app?.close();
  });

  it('não expõe o refresh token no corpo e usa cookie httpOnly', () => {
    expect(A.cookie).toMatch(/gestock_rt=/);
    expect(A.cookie).toMatch(/HttpOnly/i);
  });

  it('rejeita requisições sem token', async () => {
    await api().get('/api/ingredients').expect(401);
  });

  it('monta o catálogo da açaiteria', async () => {
    const cat = await asA('post', '/categories').send({ name: 'Bases', kind: 'INGREDIENT' }).expect(201);

    const acai = await asA('post', '/ingredients')
      .send({ name: 'Açaí', baseUnit: 'G', categoryId: cat.body.id, minStock: 1000, leadTimeDays: 2, costPerUnit: 0.03 })
      .expect(201);
    const creme = await asA('post', '/ingredients')
      .send({ name: 'Creme de ninho', baseUnit: 'G', defaultPortion: 40 })
      .expect(201);
    const granola = await asA('post', '/ingredients').send({ name: 'Granola', baseUnit: 'G' }).expect(201);
    const leite = await asA('post', '/ingredients').send({ name: 'Leite', baseUnit: 'ML' }).expect(201);
    Object.assign(ids, { acai: acai.body.id, creme: creme.body.id, granola: granola.body.id, leite: leite.body.id });

    const peso = await asA('post', '/products').send({ name: 'Açaí no peso', pricingMode: 'WEIGHT', price: 59.9 }).expect(201);
    ids.peso = peso.body.id;
    await asA('put', `/products/${ids.peso}/weight-mix`)
      .send({ items: [{ ingredientId: ids.acai, percentage: 70 }, { ingredientId: ids.creme, percentage: 30 }] })
      .expect(200);

    // Ingrediente em ML não pode entrar na composição por peso.
    await asA('put', `/products/${ids.peso}/weight-mix`)
      .send({ items: [{ ingredientId: ids.leite, percentage: 10 }] })
      .expect(400);

    const shake = await asA('post', '/products').send({ name: 'Milkshake 500ml', pricingMode: 'UNIT', price: 18 }).expect(201);
    ids.shake = shake.body.id;
    const withRecipe = await asA('put', `/products/${ids.shake}/recipe`)
      .send({ items: [{ ingredientId: ids.acai, quantity: 300 }, { ingredientId: ids.leite, quantity: 200 }] })
      .expect(200);
    expect(withRecipe.body.recipeItems).toHaveLength(2);
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
      const seenByB = await db.withContext({ tenantId: B.tenantId }, (tx) => tx.ingredient.findMany());
      expect(seenByB).toHaveLength(0);

      // Sem contexto nenhum: nada aparece.
      expect(await db.ingredient.count()).toBe(0);
      expect(await db.tenant.count()).toBe(0);

      // B tentando gravar uma linha marcada como de A: o banco recusa.
      await expect(
        db.withContext({ tenantId: B.tenantId }, (tx) =>
          tx.category.create({ data: { tenantId: A.tenantId, name: 'invasão', kind: 'PRODUCT' } }),
        ),
      ).rejects.toThrow();

      // B tentando atualizar ingrediente de A: nenhuma linha afetada.
      const updated = await db.withContext({ tenantId: B.tenantId }, (tx) =>
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
      await asA('post', '/inventory/movements').send({ ingredientId: ids.acai, type: 'INITIAL', quantity: 5000 }).expect(201);
      await asA('post', '/inventory/movements').send({ ingredientId: ids.creme, type: 'INITIAL', quantity: 2000 }).expect(201);
      await asA('post', '/inventory/movements').send({ ingredientId: ids.leite, type: 'INITIAL', quantity: 3000 }).expect(201);
      // Estoque inicial duas vezes não é permitido.
      await asA('post', '/inventory/movements').send({ ingredientId: ids.acai, type: 'INITIAL', quantity: 1 }).expect(400);

      const buy = await asA('post', '/inventory/movements')
        .send({ ingredientId: ids.acai, type: 'PURCHASE', quantity: 1000, unitCost: 0.025 })
        .expect(201);
      expect(Number(buy.body.stock)).toBe(6000);
    });

    it('venda presencial: valor + peso, baixa ESTIMADA pela composição, sem inventar ingredientes', async () => {
      const res = await asA('post', '/sales')
        .send({ channel: 'IN_STORE', totalAmount: 29.95, totalWeightG: 500, items: [{ productId: ids.peso }] })
        .expect(201);
      expect(res.body.stockImpact).toEqual({ exactMovements: 0, estimatedMovements: 2, unknownIngredients: 0 });
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
          items: [{ productId: ids.peso, unitPrice: 25, ingredients: [{ ingredientId: ids.creme }, { ingredientId: ids.granola }] }],
        })
        .expect(201);
      const sources = res.body.items[0].ingredients.map((i: { quantitySource: string }) => i.quantitySource).sort();
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

    it('excluir a venda desfaz a baixa de estoque', async () => {
      const before = Number((await asA('get', `/ingredients/${ids.leite}`)).body.stock);
      const sale = await asA('post', '/sales').send({ channel: 'IN_STORE', items: [{ productId: ids.shake }] }).expect(201);
      expect(Number((await asA('get', `/ingredients/${ids.leite}`)).body.stock)).toBe(before - 200);
      await asA('delete', `/sales/${sale.body.id}`).expect(204);
      expect(Number((await asA('get', `/ingredients/${ids.leite}`)).body.stock)).toBe(before);
    });

    it('contagem de inventário gera ajuste com a diferença', async () => {
      const res = await asA('post', '/inventory/counts')
        .send({ items: [{ ingredientId: ids.creme, countedQuantity: 1500 }] })
        .expect(201);
      expect(res.body.adjusted).toBe(1);
      const creme = await asA('get', `/ingredients/${ids.creme}`).expect(200);
      expect(Number(creme.body.stock)).toBe(1500);
    });
  });

  describe('permissões', () => {
    let staffToken = '';

    it('dono adiciona funcionário', async () => {
      await asA('post', '/tenant/members')
        .send({ email: `staff${suffix}@teste.com`, role: 'STAFF', name: 'Func', password: 'senha-provisoria-1' })
        .expect(201);
      const login = await api()
        .post('/api/auth/login')
        .send({ email: `staff${suffix}@teste.com`, password: 'senha-provisoria-1' })
        .expect(200);
      staffToken = login.body.accessToken;
      expect(login.body.tenant.id).toBe(A.tenantId);
    });

    it('funcionário registra venda mas não mexe no catálogo, ajustes nem previsão', async () => {
      const auth = { Authorization: `Bearer ${staffToken}` };
      await api().post('/api/sales').set(auth).send({ channel: 'IN_STORE', items: [{ productId: ids.shake }] }).expect(201);
      await api().post('/api/ingredients').set(auth).send({ name: 'X', baseUnit: 'G' }).expect(403);
      await api()
        .post('/api/inventory/movements')
        .set(auth)
        .send({ ingredientId: ids.acai, type: 'ADJUSTMENT', quantity: -10 })
        .expect(403);
      await api().get('/api/forecast/reorder').set(auth).expect(403);
      await api().get('/api/tenant/members').set(auth).expect(403);
    });
  });

  describe('previsão e dashboard', () => {
    it('com histórico, prevê demanda e sugere reposição como estimativa', async () => {
      // 21 dias de vendas passadas (fim de semana vende mais).
      for (let d = 21; d >= 1; d--) {
        const soldAt = new Date(Date.now() - d * DAY);
        const weekend = [0, 6].includes(soldAt.getUTCDay());
        await asA('post', '/sales')
          .send({ channel: 'IN_STORE', soldAt: soldAt.toISOString(), totalWeightG: weekend ? 800 : 400, items: [{ productId: ids.peso }] })
          .expect(201);
      }

      const products = await asA('get', '/forecast/products?horizonDays=7').expect(200);
      expect(products.body.disclaimer).toMatch(/estimativas/i);
      const peso = products.body.items.find((i: { product: { id: string } }) => i.product.id === ids.peso);
      expect(peso.forecast.status).toBe('OK');
      expect(peso.forecast.confidence).toBe('LOW');
      expect(peso.forecast.daily).toHaveLength(7);

      const reorder = await asA('get', '/forecast/reorder?coverageDays=7').expect(200);
      const acai = reorder.body.items.find((i: { ingredient: { id: string } }) => i.ingredient.id === ids.acai);
      expect(acai.usesEstimatedData).toBe(true);
      expect(acai.forecast.status).toBe('OK');
      expect(acai.recommendation.suggestedQuantity).toBeGreaterThanOrEqual(0);
      expect(typeof acai.recommendation.explanation).toBe('string');

      const granola = reorder.body.items.find((i: { ingredient: { id: string } }) => i.ingredient.id === ids.granola);
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
  });

  describe('sessão', () => {
    it('refresh rotaciona o token e reuso de token antigo derruba a sessão', async () => {
      const first = await api().post('/api/auth/refresh').set('Cookie', A.cookie).expect(200);
      const newCookie = [first.headers['set-cookie']].flat()[0];
      expect(first.body.accessToken).toBeTruthy();

      await api().post('/api/auth/refresh').set('Cookie', A.cookie).expect(401); // reuso
      await api().post('/api/auth/refresh').set('Cookie', newCookie).expect(401); // família revogada
    });

    it('bloqueia o login após 5 senhas erradas', async () => {
      const email = `b${suffix}@teste.com`;
      for (let i = 0; i < 5; i++) {
        await api().post('/api/auth/login').send({ email, password: 'errada-123' }).expect(401);
      }
      const locked = await api().post('/api/auth/login').send({ email, password: 'senha-forte-456' }).expect(401);
      expect(locked.body.message).toMatch(/tentativas/);
    });

    it('e-mail inexistente responde igual a senha errada', async () => {
      const res = await api().post('/api/auth/login').send({ email: `ninguem${suffix}@teste.com`, password: 'x' }).expect(401);
      expect(res.body.message).toBe('E-mail ou senha incorretos');
    });
  });
});
