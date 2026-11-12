# Gestock API

Back-end do Gestock: NestJS + Prisma + PostgreSQL, com isolamento entre estabelecimentos garantido por **Row Level Security**.

## Como rodar

Requisitos: Node 20+ e um PostgreSQL 15+ (Supabase, Neon ou local).

```bash
# na raiz do repositório
npm install

# configurar o ambiente
cp apps/api/.env.example apps/api/.env   # edite as URLs do banco e o JWT_ACCESS_SECRET

# criar as tabelas e as políticas de RLS (usa DIRECT_URL, o dono do banco)
npm run prisma:deploy -w @gestock/api

# criar o usuário da aplicação (uma vez): edite a senha em prisma/sql/app-role.sql e rode
npx prisma db execute --file prisma/sql/app-role.sql --schema prisma/schema.prisma   # dentro de apps/api
# depois coloque esse usuário em DATABASE_URL

# dados de demonstração (opcional): login demo@gestock.app / gestock123
npm run db:seed -w @gestock/api

# subir em modo desenvolvimento → http://localhost:3333/api
npm run dev:api
```

### Supabase
- **DIRECT_URL**: string de conexão *direct* (porta 5432) com o usuário `postgres`.
- **DATABASE_URL**: usuário `gestock_app`. Se usar o pooler (porta 6543, modo *transaction*), acrescente `?pgbouncer=true`.
- Se a API avisar que o usuário "ignora RLS", a `DATABASE_URL` está com um usuário com BYPASSRLS (como o `postgres` do Supabase). Em produção a API **se recusa a subir** nesse caso.

## Scripts (`-w @gestock/api`)

| Script | O que faz |
|---|---|
| `dev` | API com recarga automática |
| `build` / `start` | compila para `dist/` e roda |
| `test` | testes unitários (motor de previsão, regras de consumo) |
| `test:e2e` | testes ponta a ponta contra um banco real (precisa de `DATABASE_URL`) |
| `lint` / `typecheck` | qualidade |
| `prisma:migrate` | cria uma nova migration a partir do `schema.prisma` (dev) |
| `prisma:deploy` | aplica migrations pendentes |
| `prisma:studio` | interface visual do banco |
| `db:seed` | açaiteria de demonstração com 60 dias de vendas |

## Arquitetura

```
src/
├── config/env.ts            validação das variáveis de ambiente (Zod)
├── infra/prisma/            PrismaService.withContext() → transação com app.tenant_id/app.user_id
├── common/                  AuthGuard global, @Roles, @Public, @Auth, ZodPipe, auditoria, erros
└── modules/
    ├── auth/                cadastro, login, refresh com rotação, troca de estabelecimento
    ├── tenants/             dados do estabelecimento e equipe
    ├── catalog/             categorias, ingredientes, produtos, receitas, composição por peso
    ├── inventory/           movimentações (livro-razão), saldo, alertas, contagem
    ├── sales/               vendas presenciais/online + consumption.ts (regras de baixa)
    ├── forecasting/         forecast.engine.ts (previsão e reposição) + endpoints
    └── dashboard/           visão geral numa única chamada
```

**Regra de ouro do acesso a dados:** todo acesso a tabela operacional passa por `db.withContext(auth, tx => ...)`. O `tenantId` vem sempre do token, nunca do corpo da requisição.

## Segurança

- **RLS no Postgres** (`prisma/migrations/*_rls`): mesmo que o código esqueça um filtro, o banco não devolve nem grava dados de outro estabelecimento. Coberto pelos testes e2e.
- Usuário de banco da API **sem BYPASSRLS** (`prisma/sql/app-role.sql`).
- Senhas com **Argon2id**; bloqueio de 15 min após 5 tentativas erradas; mesma resposta para e-mail inexistente e senha errada.
- **Access token** JWT (15 min, HS256 fixo) + **refresh token** opaco em cookie `httpOnly` com rotação. Reuso de um token já usado derruba todas as sessões do usuário.
- Papel conferido no banco a cada requisição: desativar um funcionário corta o acesso na hora.
- Validação de entrada com Zod `.strict()` (campos extras são rejeitados), Helmet, CORS restrito, rate limit (120/min geral, 5/min em login e cadastro), limite de 200 kb no corpo.
- Auditoria (`audit_logs`) de ajustes, perdas, exclusões e mudanças de equipe.

## Endpoints (prefixo `/api`)

Autenticação: `Authorization: Bearer <accessToken>`. Valores decimais voltam como **string** (ex.: `"29.95"`), para não perder precisão.

| Método | Rota | Quem | Descrição |
|---|---|---|---|
| GET | `/health` | público | status da API e do banco |
| POST | `/auth/register` | público | cria usuário + estabelecimento (vira OWNER) |
| POST | `/auth/login` | público | `{ email, password, tenantId? }` |
| POST | `/auth/refresh` | cookie | novo access token (rotaciona o refresh) |
| POST | `/auth/logout` | cookie | encerra a sessão |
| POST | `/auth/switch-tenant` | logado | troca o estabelecimento ativo |
| GET | `/auth/me` | logado | usuário, papel e estabelecimentos |
| GET/PATCH | `/tenant` | todos / OWNER | dados do estabelecimento |
| GET/POST | `/tenant/members` | OWNER, MANAGER / OWNER | equipe |
| PATCH/DELETE | `/tenant/members/:userId` | OWNER | papel, desativar, remover |
| CRUD | `/categories` | leitura: todos · escrita: OWNER, MANAGER | `?kind=PRODUCT\|INGREDIENT` |
| CRUD | `/ingredients` | idem | lista inclui `stock` e `isLowStock` |
| CRUD | `/products` | idem | |
| PUT | `/products/:id/recipe` | OWNER, MANAGER | receita fixa (produtos UNIT) |
| PUT | `/products/:id/weight-mix` | OWNER, MANAGER | composição média % (produtos WEIGHT, ingredientes em g) |
| GET | `/inventory/levels` | todos | saldo + status OK/LOW/OUT |
| GET | `/inventory/low-stock` | todos | só os alertas |
| GET/POST | `/inventory/movements` | todos (ajuste: OWNER, MANAGER) | entradas, saídas, perdas, ajustes |
| DELETE | `/inventory/movements/:id` | OWNER, MANAGER | desfaz lançamento manual |
| POST | `/inventory/counts` | OWNER, MANAGER | contagem física → ajustes |
| POST | `/sales` | todos | registra venda presencial ou online |
| GET | `/sales` | todos | histórico com filtros e paginação |
| GET | `/sales/summary` · `/sales/top-products` | todos | relatórios do período |
| GET/DELETE | `/sales/:id` | todos / OWNER, MANAGER | detalhe; excluir desfaz a baixa |
| GET | `/forecast/products?horizonDays=7` | OWNER, MANAGER | demanda prevista por produto |
| GET | `/forecast/reorder?coverageDays=7` | OWNER, MANAGER | sugestão de compra por ingrediente |
| GET | `/dashboard?from&to` | todos (sugestões só OWNER/MANAGER) | visão geral |

### Exemplos de venda

```jsonc
// Presencial (balcão): valor do caderno + peso da balança. Nenhum ingrediente é inventado.
// Se o produto tiver composição média, a baixa de estoque é ESTIMADA (isEstimated = true).
{ "channel": "IN_STORE", "totalAmount": 29.95, "totalWeightG": 500,
  "items": [{ "productId": "<açaí no peso>" }] }

// Online: ingredientes escolhidos pelo cliente, sem gramas.
// Com porção padrão → baixa estimada; sem porção → registrado como UNKNOWN, sem baixa.
{ "channel": "ONLINE", "totalAmount": 25,
  "items": [{ "productId": "<açaí no peso>",
              "ingredients": [{ "ingredientId": "<creme>" }, { "ingredientId": "<granola>" }] }] }
```

A resposta traz `stockImpact` com quantas baixas foram exatas, estimadas ou desconhecidas.

### Previsão

Calculada até **ontem** (o dia de hoje ainda está incompleto), com até 120 dias de histórico:

| Histórico | Resultado |
|---|---|
| < 7 dias | `INSUFFICIENT_HISTORY`, sem números |
| 7–27 dias | média móvel ponderada, confiança `LOW` |
| ≥ 28 dias | + fator por dia da semana, confiança `MEDIUM` |
| ≥ 90 dias e variação baixa | confiança `HIGH` |

Sugestão de compra = consumo previsto (prazo de entrega + cobertura) + estoque de segurança − saldo. Toda resposta traz `disclaimer`, `confidence` e `usesEstimatedData`.
