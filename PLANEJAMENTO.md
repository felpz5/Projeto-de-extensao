# Gestock — Planejamento do Projeto

> Plataforma web de gestão de estoque e previsão de demanda para pequenos estabelecimentos.
> Primeiro cliente de validação: uma açaiteria parceira (sem uso da marca dela no produto).

Este documento é vivo: toda decisão importante entra aqui antes de virar código.

---

## 1. Visão em uma frase

Transformar vendas e movimentações de estoque em **indicadores, previsões e recomendações de compra**, deixando sempre claro o que é **dado medido** e o que é **estimativa**.

### Princípios do produto
1. **Genérico desde o início** — nada de regra "de açaiteria" chumbada no código. Particularidades viram configuração (ex.: "produto vendido por peso").
2. **Multi-tenant** — cada estabelecimento só enxerga os próprios dados, garantido no banco (RLS), não só no código.
3. **Honestidade dos dados** — o sistema nunca inventa ingrediente. Consumo estimado é marcado como estimado; previsão sem histórico suficiente diz isso.
4. **Simples de usar no balcão** — registrar uma venda presencial tem que levar poucos segundos, no celular.

---

## 2. Stack escolhida

| Camada | Tecnologia | Por quê |
|---|---|---|
| Linguagem | **TypeScript** (front e back) | Uma linguagem só, tipos compartilhados, menos bugs. |
| Organização | **Cliente-servidor** (`backend/` + `frontend/`) | Duas aplicações independentes no mesmo repositório, cada uma com seu `package.json`, `.env` e lint. Conversam só por HTTP. |
| Front-end | **React + Vite** + React Router | Rápido de desenvolver e de buildar; ecossistema enorme. |
| UI | **Tailwind CSS** + componentes no padrão **shadcn/ui** (Radix) | Componentes acessíveis em `components/ui/`, fácil aplicar o tema azul-marinho/branco. |
| Estado de servidor | **TanStack Query** | Cache, loading e refetch sem boilerplate. |
| Formulários | **React Hook Form + Zod** | Validação no navegador com os mesmos limites do back (o back valida de novo; erros 422 aparecem no campo). |
| Gráficos | **Recharts** | Suficiente para o dashboard. |
| Back-end | **Express** (Node 20) em camadas **MVC + Service + Repository** | Simples e conhecido pela equipe; cada camada numa pasta (`routes`, `controllers`, `services`, `repositories`...), sem "mágica" de framework. |
| ORM / migrations | **Prisma** | Schema declarativo, migrations versionadas, tipagem automática. |
| Banco | **PostgreSQL 16** | Relacional (estoque e vendas são dados fortemente relacionais), transações, `numeric` exato, **Row Level Security** nativo, funções de data/agrupamento boas para previsão. |
| Ambiente local | **Docker Compose** (`db` + `migrate` + `backend` + `frontend`) | Um comando sobe tudo igual para a equipe inteira, com o mesmo Postgres 16 e o usuário sem BYPASSRLS. |
| Hospedagem do banco | **Supabase (só o Postgres)** ou **Neon** — plano gratuito | Postgres gerenciado com backup em produção. Usamos apenas o banco; auth e API são nossas. |
| Autenticação | Própria: **Argon2** + **JWT** (access curto + refresh em cookie httpOnly) | Controle total, sem dependência de terceiros. |
| Testes | **Vitest** (front e unidades) + **Jest/Supertest** (API, padrão Nest) | Testar principalmente regras de estoque, isolamento de tenant e previsão. |
| Qualidade | **ESLint + Prettier + Husky + lint-staged + commitlint** | Padrão de código e de commit automático. |
| Deploy (sugestão) | Front: **Vercel** · API: **Render** ou **Railway** | Planos gratuitos/baratos, deploy a partir do GitHub. |

> **Por que não Supabase completo (auth + API automática)?** A decisão é desenvolver front e back nós mesmos. Mantemos Postgres + RLS (o que o Supabase tem de melhor para nós) e escrevemos a API em Express, o que dá mais aprendizado e controle sobre regras de negócio (baixa de estoque, previsão).

> **Ambiente local:** Docker Desktop + `docker compose up --build -d` (ver README da raiz). Para desenvolver com recarga automática, sobe só o banco no Docker e roda back e front com `npm run dev`.

---

## 3. Arquitetura

### 3.1 Estrutura do repositório

Arquitetura **cliente-servidor**: duas aplicações independentes, cada uma com o próprio
`package.json`, `.env` e configuração. A raiz só agrupa as partes.

```
gestock/
├── backend/                 # SERVIDOR — Express + Prisma (ver backend/README.md)
│   ├── server.ts            # sobe o HTTP
│   ├── app.ts               # monta o Express (segurança, rotas, erros)
│   ├── config/              # env validado (Zod), Prisma + withContext (RLS)
│   ├── routes/              # URL + middlewares → controller
│   ├── controllers/         # HTTP: valida entrada, chama service, devolve status
│   ├── services/            # regras de negócio (+ motor de previsão e regras de consumo)
│   ├── repositories/        # acesso ao banco via Prisma
│   ├── middlewares/         # authenticate, authorize, rate limit, erros
│   ├── validations/         # schemas Zod
│   ├── types/               # DTOs e tipos de domínio
│   ├── utils/               # AppError, JWT, senha, datas, logger
│   ├── prisma/              # schema.prisma, migrations, seed
│   └── test/                # unit/ e e2e/
├── frontend/                # CLIENTE — React + Vite + nginx no Docker
│   └── src/
│       ├── app/             # rotas, layout, providers
│       ├── features/        # uma pasta por domínio (auth, dashboard, sales, inventory, ingredients, products, forecast, settings)
│       ├── components/      # componentes genéricos (ui/ = shadcn)
│       └── lib/             # cliente HTTP (renova a sessão sozinho), tipos da API, formatação, schemas
├── docker-compose.yml       # sobe db + migrate + backend + frontend
├── PLANEJAMENTO.md          # este arquivo
```

### 3.2 Camadas do back-end (uma pasta por camada)

```
Route       →  URL, autenticação e papel exigido (middlewares)
Controller  →  recebe HTTP, valida DTO (Zod), devolve o status
Service     →  regra de negócio (ex.: venda gera baixa de estoque); abre a transação do tenant
Repository  →  acesso ao banco via Prisma (sempre com a transação `tx` do tenant)
```

Regra: controller não fala com Prisma; service não conhece HTTP.

### 3.3 Fluxo de uma requisição

```
Front (JWT no header)
  → routes: authenticate valida o token → extrai user_id e tenant_id ativo
            e confere no banco que o usuário é membro ATIVO do tenant (papel atualizado)
  → routes: authorize(...) confere o papel exigido pela rota
  → controller valida o body/query com Zod e chama o service
  → service abre a transação com withContext → SET LOCAL app.tenant_id = '<uuid>'
  → repository consulta; o Postgres aplica RLS: qualquer SELECT/UPDATE só vê linhas desse tenant
```

---

## 4. Multi-tenant e segurança

### 4.1 Modelo de isolamento
- **Banco único, schema único, coluna `tenant_id` em toda tabela operacional.** Mais simples de manter e escalar para muitos clientes pequenos.
- **Defesa em profundidade (duas camadas):**
  1. **Aplicação:** todo repositório filtra por `tenant_id` vindo do token, nunca do body.
  2. **Banco (RLS):** políticas `USING (tenant_id = current_setting('app.tenant_id')::uuid)` com `FORCE ROW LEVEL SECURITY`. Mesmo que um bug esqueça o filtro, o banco bloqueia.
- **Dois usuários de banco:**
  - `gestock_owner` — dono das tabelas, usado **só** para rodar migrations.
  - `gestock_app` — usado pela API, **sem** `BYPASSRLS`, sem permissão de DDL.
- Teste automatizado obrigatório: "usuário do tenant A não consegue ler/alterar nada do tenant B".

### 4.2 Autenticação
- Senha com **Argon2id**.
- **Access token** JWT de ~15 min (no header `Authorization`).
- **Refresh token** de ~7 dias em cookie `httpOnly`, `Secure`, `SameSite=Strict`, com rotação e armazenamento do hash no banco (permite logout/revogação). Duas abas renovando ao mesmo tempo não derrubam a sessão (janela de 30 s).
- Rate limiting no login e cadastro (`express-rate-limit`).
- Bloqueio temporário após várias tentativas erradas (sem revelar se o e-mail existe).
- Senha criada pelo dono para um funcionário é **provisória**: troca obrigatória no primeiro acesso (`POST /auth/change-password`).
- Esqueceu a senha: dono/gerente define uma **senha provisória** (`POST /tenant/members/:id/password`), que encerra as sessões da pessoa. Só vale para contas usadas apenas naquele estabelecimento (o dono de uma loja não pode tomar a conta de quem é dono de outra). Recuperação por e-mail ainda não existe.
- Trocar o próprio e-mail (que é o login) exige a senha atual.

### 4.3 Autorização (papéis por estabelecimento)

| Papel | Pode |
|---|---|
| `OWNER` | Tudo, inclusive editar dados do estabelecimento e gerenciar gerentes. |
| `MANAGER` | Catálogo, receitas, estoque (ajustes, contagem, estorno), vendas (cancelar/corrigir qualquer uma), relatórios, previsão, auditoria e os **funcionários** da equipe (adicionar, desativar, redefinir senha). |
| `STAFF` | Registrar vendas e **compras** de mercadoria; ver o **próprio caixa** do dia e cancelar/corrigir a **própria** venda nos primeiros 15 minutos; consultar estoque. **Não** vê faturamento, custos, valor do estoque, histórico de vendas nem relatórios — esses dados nem saem da API para ele. |

Venda **nunca é apagada**: erro vira cancelamento (com motivo, quem e quando, na auditoria) ou correção (cancela a original e registra a certa, ligada a ela). O estoque que a venda baixou é estornado.

Um usuário pode pertencer a mais de um estabelecimento (tabela `memberships`). Quando o dono adiciona um e-mail que **já tem conta**, isso vira um **convite**: a pessoa só entra no estabelecimento depois de aceitar.

### 4.4 Outras medidas
- Validação de toda entrada com **Zod** (whitelist; campos extras rejeitados).
- **Helmet**, **CORS** restrito ao domínio do front.
- Segredos só em variáveis de ambiente (`.env` no `.gitignore`; `.env.example` versionado).
- Prisma usa queries parametrizadas (proteção contra SQL injection).
- Logs sem dados sensíveis (sem senha, sem token).
- `audit_log` para ações sensíveis (ajuste de estoque, exclusões, mudança de papel).
- Dependabot ativado no GitHub.
- LGPD: coletar o mínimo de dados pessoais (nome e e-mail dos usuários; nenhum dado de cliente final no MVP).

---

## 5. Modelo de dados (MVP)

Convenções: `id uuid`, `created_at`, `updated_at`; quantidades em `numeric(14,3)` na **unidade base** do item (g, ml ou un); dinheiro em `numeric(12,2)`.

### 5.1 Contas
- **users** — id, name, email (único), password_hash, must_change_password, created_at
- **tenants** — id, name, slug, segment (açaiteria, sorveteria, mercado...), timezone, created_at
- **memberships** — user_id, tenant_id, role (`OWNER|MANAGER|STAFF`), status (`ACTIVE|DISABLED|INVITED`)
- **refresh_tokens** — user_id, token_hash, expires_at, revoked_at

### 5.2 Catálogo
- **categories** — tenant_id, name, kind (`PRODUCT|INGREDIENT`)
- **units** — código e unidade base (`g`, `kg`→g, `ml`, `l`→ml, `un`) — tabela global, fixa
- **ingredients** — tenant_id, name, category_id, base_unit, min_stock, cost_per_unit, lead_time_days (prazo de reposição), **default_portion** (porção padrão por uso, opcional), active
- **products** — tenant_id, name, category_id, **pricing_mode** (`UNIT` = preço fixo | `WEIGHT` = preço por kg), price, active
- **recipes / recipe_items** — product_id, ingredient_id, quantity (quantidade por unidade do produto). Usado para baixa automática quando o produto tem composição fixa.
- **weight_mix** *(composição média, opcional)* — product_id, ingredient_id, percentage. Ex.: "pote por peso = 70% açaí, 15% creme, 15% complementos". Usado **apenas** para estimativas.

### 5.3 Estoque (livro-razão)
- **stock_movements** — tenant_id, ingredient_id, type, quantity (+ entrada / − saída), unit_cost, occurred_at, sale_id (opcional), **is_estimated** (bool), note, created_by
  - `type`: `INITIAL` · `PURCHASE` · `SALE_CONSUMPTION` · `MANUAL_OUT` · `LOSS` · `ADJUSTMENT`
- **Saldo** = soma das movimentações por ingrediente (view `stock_levels`). Nunca editamos saldo direto nem apagamos lançamentos; ajuste é uma movimentação nova → histórico completo e auditável. Lançamento digitado errado é **estornado** (movimentação inversa, campos `reverses_id`/`reversed_at`).
- Inventário físico (contagem) gera um `ADJUSTMENT` com a diferença em relação ao saldo **na data da contagem** — isso também **corrige o erro das estimativas** periodicamente. Na previsão, os ajustes corrigem o consumo registrado proporcionalmente (para cima ou para baixo), sem criar pico no dia da contagem.

### 5.4 Vendas
- **sales** — tenant_id, channel (`IN_STORE|ONLINE`), sold_at, total_amount, **total_weight_g** (opcional), notes, created_by, **payment_method** (`CASH|PIX|CREDIT_CARD|DEBIT_CARD|VOUCHER|OTHER`), **status** (`COMPLETED|CANCELED`), canceled_at/by, cancel_reason, corrects_id (correção)
- **sale_items** — sale_id, product_id, quantity, unit_price, weight_g (opcional)
- **sale_item_ingredients** — sale_item_id, ingredient_id, quantity (opcional), **quantity_source**:
  - `MEASURED` — pesado/informado de verdade
  - `RECIPE` — veio da receita fixa
  - `STANDARD_PORTION` — selecionado + porção padrão configurada (estimativa)
  - `UNKNOWN` — sabemos que foi usado, não sabemos quanto

### 5.5 Suporte
- **audit_log** — tenant_id, user_id, action, entity, entity_id, payload, created_at
- **forecast_snapshots** *(fase 2)* — guarda previsões geradas para medir acurácia depois.

---

## 6. Regras de negócio da açaiteria (modeladas de forma genérica)

### 6.1 Venda presencial (balcão)
- Funcionário registra: **valor**, **peso total do pote** (opcional) e data/hora (padrão: agora).
- Produto do tipo `WEIGHT` (ex.: "Açaí no peso").
- **Não registramos ingredientes** (o caderno/balança não informa).
- Baixa de estoque:
  - Se existir `weight_mix` configurado → gera `SALE_CONSUMPTION` com `is_estimated = true` (peso × percentual).
  - Se não existir → nenhuma baixa; a venda conta para demanda de **produto**, e o consumo de ingredientes é reconciliado pelo inventário físico.

### 6.2 Venda online (site)
- Funcionário registra: **valor**, data/hora e **ingredientes selecionados** pelo cliente.
- Quantidade de cada ingrediente:
  - Com `default_portion` configurada → `STANDARD_PORTION`, baixa estimada.
  - Sem porção → `UNKNOWN`, sem baixa; conta só como "frequência de uso" (útil para ranking e previsão relativa).

### 6.3 Regra de ouro
> **Ingrediente selecionado ≠ quantidade consumida.** Toda tela que mostra consumo ou saldo derivado de estimativa exibe o selo **"Estimado"**. Saldo real só é confirmado por entrada de compra ou contagem de inventário.

### 6.4 Venda com receita fixa (outros negócios)
- Produto `UNIT` com receita → baixa automática exata (`RECIPE`, `is_estimated = false`). Ex.: milkshake de 500 ml, sanduíche, kit.

---

## 7. Previsão de demanda e reposição (v1)

Objetivo da v1: **simples, explicável e honesta.** Nada de "caixa-preta". Roda dentro da API (TypeScript), sob demanda e com cache diário.

### 7.1 Requisitos mínimos de dados
| Histórico disponível | O que o sistema mostra |
|---|---|
| < 7 dias | "Histórico insuficiente para previsão." Só mostra totais. |
| 7–27 dias | Previsão por **média móvel** — confiança **baixa**. |
| ≥ 28 dias | Média móvel ponderada **+ fator por dia da semana** — confiança **média**. |
| ≥ 90 dias e baixa variação | Confiança **alta** (avaliar suavização exponencial / Holt-Winters na fase 2). |

### 7.2 Cálculo
1. Série diária de demanda por **produto** (vendas) e por **ingrediente** (consumo registrado/estimado).
2. Média dos últimos N dias, com pesos maiores para dias recentes.
3. Fator de dia da semana = média do dia da semana ÷ média geral (açaí vende mais no fim de semana).
4. Previsão para os próximos 7 dias = média × fator de cada dia.
5. Faixa de incerteza = previsão ± desvio padrão histórico (mostrar como intervalo, nunca número exato).

### 7.3 Recomendação de reposição (por ingrediente)
```
cobertura          = lead_time_days + dias_de_cobertura_desejados (padrão 7)
demanda_prevista   = soma da previsão diária no período de cobertura
estoque_seguranca  = z × desvio_padrão_diário × √lead_time      (z ≈ 1,65)
sugestao_compra    = max(0, demanda_prevista + estoque_seguranca − saldo_atual)
dias_ate_acabar    = saldo_atual ÷ média_diária
```
Cada sugestão exibe: quantidade, nível de confiança, quantos dias de histórico foram usados e se a base contém consumo estimado.

### 7.4 Fase 2 (se der tempo)
- Feriados e clima (açaí × temperatura).
- Medir erro das previsões (MAPE) com `forecast_snapshots`.
- Microserviço Python (statsmodels/Prophet) se o volume justificar.

---

## 8. Identidade visual

- Fundo **azul-marinho** predominante; textos e elementos em **branco**; um tom de destaque para ações e alertas.
- Paleta inicial (ajustável):
  - `--navy-950: #0A1628` (fundo) · `--navy-900: #0F2040` (cartões) · `--navy-700: #1E3A6B` (bordas/hover)
  - `--white: #FFFFFF` · `--muted: #A9B8D0` (texto secundário)
  - `--accent: #38BDF8` (ações) · `--warning: #F59E0B` (estoque baixo / estimado) · `--danger: #EF4444` · `--success: #22C55E`
- Fonte: **Inter**.
- **Mobile-first**: o registro de venda e de entrada precisa funcionar bem no celular.
- Logo própria "Gestock" (sem marca da açaiteria).

---

## 9. Organização Git / GitHub

### 9.1 Branches
- `main` — versão estável (a que será apresentada). Protegida: só recebe PR vindo da `develop`, revisado e com testes passando.
- `develop` — branch comum de trabalho: a equipe faz push direto aqui (sempre `git pull` antes).
- Branches de funcionalidade são **opcionais**, para entregas grandes: `feat/<escopo>-<descricao>`, `fix/...`, `docs/...`
  Ex.: `feat/backend-base` → PR para `develop`.

### 9.2 Commits — Conventional Commits
```
feat(sales): registrar venda presencial com peso
fix(inventory): corrigir arredondamento de saldo
docs: atualizar modelo de dados
```

### 9.3 Fluxo de trabalho
1. Toda tarefa vira uma **Issue** (com label: `frontend`, `backend`, `banco`, `segurança`, `previsão`).
2. **GitHub Projects** (quadro Kanban): Backlog → A fazer → Em andamento → Revisão → Pronto.
3. Trabalho do dia a dia direto na `develop`; entregas grandes em branch própria → PR para `develop`.
   Ao fechar uma fase: PR `develop` → `main`.
4. Template de PR com checklist (testes, migration, prints de tela).
5. **Milestones** = fases do roadmap abaixo.

---

## 10. Roadmap (MVP por fases)

> Ajustar datas conforme o prazo do projeto de extensão.

| Fase | Entregas | Itens da especificação | Back-end | Front-end |
|---|---|---|---|---|
| **0 — Fundação** | Repositório cliente-servidor, lint, banco provisionado, Prisma, design system base, tela de login | — | ✅ | ✅ |
| **1 — Contas e isolamento** | Cadastro/login, criação de estabelecimento, convite de funcionário, papéis, RLS + teste de isolamento | 1, 2 | ✅ | ✅ |
| **2 — Catálogo** | Categorias, ingredientes, produtos (unidade/peso), receitas, mix por peso | 3, 4 | ✅ | ✅ |
| **3 — Estoque** | Estoque inicial, compras/entradas, saídas, ajustes, inventário, histórico, saldo, alerta de estoque baixo | 5, 6, 10 | ✅ | ✅ |
| **4 — Vendas** | Venda presencial (valor + peso), venda online (ingredientes selecionados), baixa automática/estimada, histórico e filtros | 7, 8 | ✅ | ✅ |
| **5 — Dashboard** | Total de vendas, nº de pedidos, mais vendidos, estoque baixo, movimentações recentes | 9 | ✅ | ✅ |
| **6 — Previsão** | Previsão de demanda, sugestão de reposição, indicadores de confiança | 11 | ✅ | ✅ |
| **7 — Validação** | Seed com dados realistas, uso real na açaiteria, ajustes, deploy, documentação final | — | 🟨 seed pronto | 🟨 telas prontas, falta uso real |

Detalhes: [backend/README.md](backend/README.md) (endpoints, segurança) e [frontend/README.md](frontend/README.md) (telas, permissões).

Fora do MVP: pagamentos, assinaturas, nota fiscal, integração com balança/site, fornecedores (pode entrar como cadastro simples se sobrar tempo).

---

## 11. Decisões em aberto (precisamos responder)

1. **Prazo final** do projeto e quantas pessoas no time? (define o tamanho de cada fase)
2. **Banco gerenciado:** Supabase (Postgres) ou Neon? *(sugestão: Supabase)*
3. A açaiteria consegue informar o **peso do pote** em toda venda presencial, ou só o valor?
4. Ela aceitaria definir **porções padrão** (ex.: "1 concha de creme ≈ 40 g") para melhorar as estimativas?
5. Com que frequência dá para fazer **contagem de inventário** (semanal?) — é o que corrige as estimativas.
6. Quantos meses de **histórico do caderno** existem? Vale digitar para alimentar a previsão desde o início.

---

## 12. Próximos passos imediatos

1. Responder a seção 11.
2. Provisionar o banco (Supabase), aplicar as migrations e criar o usuário `gestock_app`.
3. Testar o front com a açaiteria no celular (registro de venda no balcão e entrada de mercadoria) e ajustar.
4. Os tipos da API estão copiados em `frontend/src/lib/types.ts`: se o contrato mudar muito, avaliar gerar a partir de uma documentação OpenAPI.
5. Deploy da API (Render/Railway) e do front (Vercel).
