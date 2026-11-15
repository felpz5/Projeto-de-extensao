# Gestock — Back-end

API do Gestock: **Node.js + TypeScript + Express + Prisma + PostgreSQL**, organizada em camadas
(**MVC + Service + Repository**), com isolamento entre estabelecimentos garantido por **Row Level Security**.

## Como rodar

Requisitos: Node 20+ e um PostgreSQL 15+ (Supabase, Neon ou local). Todos os comandos rodam **dentro de `backend/`**.

```bash
cd backend
npm install

# configurar o ambiente
cp .env.example .env          # edite as URLs do banco e o JWT_ACCESS_SECRET

# criar as tabelas e as políticas de RLS (usa DIRECT_URL, o dono do banco)
npm run prisma:deploy

# criar o usuário da aplicação (uma vez): edite a senha em prisma/sql/app-role.sql e rode
npx prisma db execute --file prisma/sql/app-role.sql --schema prisma/schema.prisma
# depois coloque esse usuário em DATABASE_URL

# dados de demonstração (opcional): login demo@gestock.app / gestock123
npm run db:seed

# subir em modo desenvolvimento → http://localhost:3333/api
npm run dev
```

### Supabase
- **DIRECT_URL**: string de conexão *direct* (porta 5432) com o usuário `postgres`.
- **DATABASE_URL**: usuário `gestock_app`. Se usar o pooler (porta 6543, modo *transaction*), acrescente `?pgbouncer=true`.
- Se a API avisar que o usuário "ignora RLS", a `DATABASE_URL` está com um usuário com BYPASSRLS (como o `postgres` do Supabase). Em produção a API **se recusa a subir** nesse caso.
- Atrás do proxy do Render/Railway, use `TRUST_PROXY=1` para o limite de requisições enxergar o IP real.

## Scripts

| Script | O que faz |
|---|---|
| `dev` | API com recarga automática (`tsx watch`) |
| `build` / `start` | compila para `dist/` e roda `dist/server.js` |
| `test` | testes unitários (motor de previsão, regras de consumo) |
| `test:e2e` | testes ponta a ponta contra um banco real (ver abaixo) |
| `lint` / `typecheck` / `format` | qualidade de código |
| `prisma:migrate` | cria uma nova migration a partir do `schema.prisma` (dev) |
| `prisma:deploy` | aplica migrations pendentes |
| `prisma:studio` | interface visual do banco |
| `db:seed` | açaiteria de demonstração com 60 dias de vendas |

### Com Docker

O [docker-compose.yml](../docker-compose.yml) da raiz sobe o banco, aplica as migrations, cria o usuário
`gestock_app` e roda a API. A imagem tem três alvos ([Dockerfile](Dockerfile)): `tools` (migrations e seed),
`build` e `runtime` (só dependências de produção, usuário sem privilégios, health check em `/api/health`).

### Testes ponta a ponta (rodar antes de abrir PR para a `main`)

Não há CI: os testes e2e são a garantia de que o isolamento entre estabelecimentos (RLS) continua
funcionando.

> ⚠️ **Rode num banco só de teste.** Os testes criam estabelecimentos e contas (`@teste.com`) e não
> apagam no final. Não aponte para o banco que você usa no dia a dia.

O jeito mais fácil é um ambiente Docker separado (outro nome de projeto, outra porta):

```bash
# na raiz do repositório: ambiente de teste com banco próprio
DB_PORT=55433 docker compose -p gestock-teste up -d db migrate
DATABASE_URL=postgresql://gestock_app:<APP_DB_PASSWORD>@localhost:55433/gestock npm run test:e2e
docker compose -p gestock-teste down -v   # apaga o banco de teste
```

Ou contra outro banco de teste, com as migrations aplicadas e o usuário `gestock_app` criado:

```bash
npm run prisma:deploy                                # no banco de teste (DIRECT_URL = dono)
npx prisma db execute --file prisma/sql/app-role.sql --schema prisma/schema.prisma
DATABASE_URL=postgresql://gestock_app:<senha>@<host>/<banco_de_teste> npm run test:e2e
```

## Arquitetura

```
backend/
├── server.ts            sobe o servidor HTTP (conecta no banco, confere o usuário sem BYPASSRLS)
├── app.ts               monta o Express: helmet, cors, json, cookies, rate limit, rotas, erros
├── config/              env.ts (variáveis validadas com Zod) · database.ts (Prisma + withContext)
├── routes/              URL + middlewares de cada recurso → controller
├── controllers/         lê a requisição, valida com Zod, chama o service, devolve o status HTTP
├── services/            regras de negócio (abre a transação com o tenant e chama os repositórios)
│   ├── forecast-engine.ts   motor de previsão e reposição (funções puras)
│   └── sale-consumption.ts  regras de baixa de estoque de uma venda (funções puras)
├── repositories/        único lugar que fala com o Prisma; sempre recebe a transação `tx`
├── middlewares/         authenticate, authorize, rate limit, 404 e tratamento de erros
├── validations/         schemas Zod de body/query de cada recurso
├── types/               DTOs (inferidos dos schemas) e tipos de domínio
├── utils/               AppError, JWT, senha, datas, tokens, logger
├── prisma/              schema.prisma, migrations (inclui RLS), seed e SQL do usuário da API
└── test/                unit/ (regras puras) · e2e/ (API + banco real)
```

### Fluxo de uma requisição

```
routes        sale.routes.ts        POST /api/sales → authenticate → saleController.store
middlewares   authenticate          valida o JWT e confere no banco que o vínculo está ATIVO → req.user
controllers   sale.controller.ts    createSaleSchema.parse(req.body) → saleService.create(req.user, dados)
services      sale.service.ts       withContext(req.user, tx => ...) aplica a regra de negócio
repositories  sale.repository.ts    tx.sale.create(...)   ← o Postgres aplica o RLS do tenant
```

**Regras:**
- O controller não fala com o Prisma, e o service não conhece `req`/`res`.
- Todo acesso a tabela operacional passa por `withContext(auth, tx => ...)` e os repositórios recebem esse `tx`.
- O `tenantId` vem sempre do token, nunca do corpo da requisição.
- Erros de negócio usam `throw new AppError(mensagem, status)`; o `error-handler.middleware` responde.

## Segurança

- **RLS no Postgres** (`prisma/migrations/*_rls`): mesmo que o código esqueça um filtro, o banco não devolve nem grava dados de outro estabelecimento. Coberto pelos testes e2e.
- Usuário de banco da API **sem BYPASSRLS** (`prisma/sql/app-role.sql`).
- Senhas com **Argon2id**; bloqueio de 15 min após 5 tentativas erradas. E-mail inexistente, senha errada e conta bloqueada respondem igual (só quem acerta a senha de uma conta bloqueada fica sabendo do bloqueio).
- Senha criada por um dono é **provisória** (`user.mustChangePassword = true`): o front deve levar para `POST /auth/change-password`. Trocar a senha encerra as outras sessões.
- **Access token** JWT (15 min, HS256 fixo) + **refresh token** opaco em cookie `httpOnly` com rotação. Reuso de um token já usado derruba todas as sessões do usuário — exceto nos 30 s seguintes à rotação (duas abas renovando juntas): aí a resposta é `409` com `code: "REFRESH_RACE"` e o front só precisa tentar de novo.
- Conta que já existe **não é colocada** na equipe de outro estabelecimento sem consentir: vira convite (`INVITED`) até a pessoa aceitar.
- Papel conferido no banco a cada requisição: desativar um funcionário corta o acesso na hora.
- Validação de entrada com Zod `.strict()` (campos extras são rejeitados), Helmet, CORS restrito, rate limit (120/min geral, 5/min em login e cadastro), limite de 200 kb no corpo.
- Auditoria (`audit_logs`) de ajustes, perdas, estornos, exclusões e mudanças de equipe. A API só **insere** no log (sem UPDATE/DELETE).
- Estoque é livro-razão: lançamento errado é **estornado** (movimentação inversa), nunca apagado.

## Respostas de erro

| Status | Quando | Corpo |
|---|---|---|
| 400 | regra de negócio violada, JSON malformado, valor fora do limite do banco | `{ message }` |
| 401 / 403 | sem login / sem permissão | `{ message }` |
| 404 | recurso ou rota não encontrados (inclusive de outro estabelecimento) | `{ message }` |
| 409 | registro duplicado ou em uso · corrida no refresh | `{ message, code? }` |
| 422 | dados inválidos (Zod) | `{ message, issues: [{ path, message }] }` |
| 429 | limite de requisições | `{ message }` |

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
| GET | `/auth/me` | logado | usuário, papel, estabelecimentos e convites pendentes |
| PATCH | `/auth/me` | logado | `{ name?, email?, currentPassword? }` · trocar o e-mail exige a senha atual |
| GET | `/auth/stores?days=30` | logado | resumo de todas as lojas em que a pessoa é dona ou gerente |
| POST | `/auth/change-password` | logado | `{ currentPassword, newPassword }` · encerra as outras sessões |
| GET | `/auth/invitations` | logado | convites pendentes |
| POST/DELETE | `/auth/invitations/:tenantId[/accept]` | logado | aceitar (`POST .../accept`) ou recusar (`DELETE`) |
| GET/PATCH | `/tenant` | todos / OWNER | dados do estabelecimento |
| GET/POST | `/tenant/members` | OWNER, MANAGER | equipe · conta nova: `{ email, role, name, password }` (senha provisória) · conta existente: vira convite · **gerente só adiciona STAFF** |
| PATCH/DELETE | `/tenant/members/:userId` | OWNER, MANAGER | papel, desativar, remover (ou cancelar convite) · gerente só mexe em STAFF |
| POST | `/tenant/members/:userId/password` | OWNER, MANAGER | `{ password }`: senha provisória para quem esqueceu · encerra as sessões da pessoa · só para contas usadas apenas neste estabelecimento |
| GET | `/tenant/audit?entity&userId&take&skip` | OWNER, MANAGER | auditoria: quem fez o quê e quando |
| CRUD | `/categories` | leitura: todos · escrita: OWNER, MANAGER | `?kind=PRODUCT\|INGREDIENT` |
| CRUD | `/ingredients` | idem | lista inclui `stock` e `isLowStock` |
| CRUD | `/products` | idem | |
| PUT | `/products/:id/recipe` | OWNER, MANAGER | receita fixa (produtos UNIT) |
| PUT | `/products/:id/weight-mix` | OWNER, MANAGER | composição média % (produtos WEIGHT, ingredientes em g) |
| GET | `/inventory/levels` | todos | saldo + status OK/LOW/OUT |
| GET | `/inventory/low-stock` | todos | só os alertas |
| GET/POST | `/inventory/movements` | todos (STAFF só lança `PURCHASE`) | entradas, saídas, perdas, ajustes |
| POST | `/inventory/movements/:id/reverse` | OWNER, MANAGER | estorna lançamento manual digitado errado |
| POST/GET | `/inventory/counts` | OWNER, MANAGER | contagem física → ajustes · `GET`: histórico de contagens |
| GET | `/inventory/report?from&to` | OWNER, MANAGER | perdas e ajustes por ingrediente (precisão das estimativas) |
| POST | `/sales` | todos | registra venda · `paymentMethod`: `CASH`, `PIX`, `CREDIT_CARD`, `DEBIT_CARD`, `VOUCHER`, `OTHER` |
| GET | `/sales/cash?date&userId` | todos (STAFF: só o próprio) | fechamento de caixa do dia, por forma de pagamento |
| GET | `/sales` | OWNER, MANAGER | histórico com filtros (`status`, `paymentMethod`...) e paginação |
| GET | `/sales/summary` · `/sales/top-products` | OWNER, MANAGER | relatórios do período (com custo estimado e lucro bruto) |
| GET | `/sales/:id` | OWNER, MANAGER · STAFF só a própria | detalhe com as baixas de estoque |
| POST | `/sales/:id/cancel` | OWNER, MANAGER · STAFF: a própria, até 15 min | `{ reason }` · venda nunca é apagada: fica cancelada e o estoque é estornado |
| POST | `/sales/:id/correct` | idem | corpo igual ao de `POST /sales` · cancela a original e registra a nova ligada a ela, na mesma data |
| GET | `/forecast/products?horizonDays=7` | OWNER, MANAGER | demanda prevista por produto |
| GET | `/forecast/reorder?coverageDays=7` | OWNER, MANAGER | sugestão de compra por ingrediente |
| GET | `/dashboard?from&to` | todos (STAFF vê só estoque; vendas e sugestões: OWNER/MANAGER) | visão geral |

**Dados financeiros** (custo de ingrediente, valor do estoque, custo de compra, margem) voltam como
`null` para o funcionário (`utils/visibility.ts`). Produtos trazem `costing` (custo, margem e %) para
dono e gerente.

**Datas:** no corpo, use ISO 8601 com fuso (`2026-11-30T15:00:00-03:00`); datas futuras são recusadas.
Nos filtros (`from`/`to`), `2026-11-30` significa o dia inteiro **no fuso do estabelecimento**.

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
