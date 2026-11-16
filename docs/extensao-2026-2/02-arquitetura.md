# 2. Arquitetura

## Tecnologias (confirmadas nos `package.json`)

| Camada | Tecnologia | Papel |
|---|---|---|
| Front-end | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Recharts, PWA (vite-plugin-pwa) | Telas responsivas, gráficos, app instalável |
| Back-end | Node.js 20, Express 5, TypeScript, Zod | API REST em camadas: rotas → controllers → services → repositories |
| Dados | PostgreSQL 16, Prisma 6.16.2 | Tabelas, migrations versionadas, Row Level Security, trigger de saldo |
| Segurança | Argon2, JWT (15 min) + refresh token em cookie httpOnly com rotação, Helmet, limite de requisições | Senhas, sessões, cabeçalhos, proteção contra abuso |
| Infraestrutura | Docker Compose (db, migrate, backend, frontend/nginx); blueprint `render.yaml` | Ambiente reproduzível; publicação |

O **motor estatístico é código próprio em TypeScript**, dentro da API. Não há serviço em
Python, Prophet ou bibliotecas de previsão: as fórmulas estão nos arquivos abaixo e são
testadas uma a uma.

## Fluxo de informações

```
Venda / movimentação ──► PostgreSQL (RLS por estabelecimento)
CSV do histórico ─────►   │  sales (source = APP | IMPORT), stock_movements, ingredient_balances
                          ▼
              forecast.repository.ts — agrega por DIA no fuso da loja (SQL)
                          ▼
              forecast-engine.ts ───── modelo Gestock + reposição
              forecast-evaluation.ts ─ modelos de referência, backtesting, métricas
                          ▼
              forecast.service.ts ──── precisão por item, avisos, explicação
                          ▼
   GET /api/forecast/products · /products/:id · /reorder · /accuracy
                          ▼
              forecast-page.tsx ────── reposição · demanda (gráfico real × previsto) · precisão
```

## Motor estatístico

| Arquivo | Responsabilidade |
|---|---|
| [backend/services/forecast-engine.ts](../../backend/services/forecast-engine.ts) | Série diária, fatores por dia da semana, filtro de atípicos (Hampel), previsão com faixa, recomendação de compra |
| [backend/services/forecast-evaluation.ts](../../backend/services/forecast-evaluation.ts) | Modelos ingênuo, ingênuo sazonal e Holt-Winters; backtesting com janela crescente; MAE, RMSE, WAPE, viés, cobertura da faixa; agregação por unidade |
| [backend/services/forecast.service.ts](../../backend/services/forecast.service.ts) | Monta as séries (produtos, ingredientes, loja), detecta dias sem estoque, aplica o backtesting, gera avisos e a explicação determinística |
| [backend/repositories/forecast.repository.ts](../../backend/repositories/forecast.repository.ts) | Consultas SQL por dia (índices por estabelecimento e data) |
| [backend/scripts/relatorio-precisao.mjs](../../backend/scripts/relatorio-precisao.mjs) | Gera o relatório de precisão em Markdown a partir da API (reprodutível) |

Endpoints (só dono e gerente):

| Rota | Retorna |
|---|---|
| `GET /api/forecast/products?horizonDays=7` | Previsão por produto + precisão medida + avisos |
| `GET /api/forecast/products/:id?horizonDays&lookbackDays` | Histórico, previsão, backtesting com 4 modelos e 3 horizontes, explicação |
| `GET /api/forecast/accuracy?lookbackDays=120` | Precisão da loja agregada por unidade (pedidos, unidades, potes, g, ml, un) |
| `GET /api/forecast/reorder?coverageDays=7` | Sugestão de compra por ingrediente, com precisão e avisos |

## Segurança e isolamento entre estabelecimentos

- Toda tabela operacional tem `tenant_id` e **Row Level Security forçado**: o banco só devolve
  linhas do estabelecimento da sessão, mesmo que o código esqueça um filtro.
- A API conecta com um usuário de banco **sem BYPASSRLS** (`gestock_app`); as migrations usam
  o dono das tabelas.
- O estabelecimento vem sempre do token, nunca do corpo da requisição.
- Todas as consultas usam parâmetros (Prisma / `$queryRaw` com template) — sem SQL montado
  por concatenação de texto.
- Previsão, precisão e importação: **só dono e gerente** (`authorize(...MANAGERS)`).
- Testes ponta a ponta verificam que outra loja recebe 404/lista vazia (documento 5).

## Importação de histórico (decisão de projeto)

**Problema:** a previsão precisa de histórico, mas o parceiro começa a usar o sistema "do zero".
O histórico do caderno/planilha precisa entrar sem bagunçar o estoque atual.

**Decisão:** cada linha do CSV vira uma venda com `source = IMPORT`, ligada a um lote
(`sale_imports`).

| Regra | Por quê |
|---|---|
| Venda importada **não gera movimentação de estoque** | O saldo atual foi contado/lançado; baixar vendas antigas o deixaria errado |
| Só datas **até ontem** e até 5 anos atrás | O caixa de hoje não muda; datas absurdas são recusadas |
| **Tudo ou nada** (uma transação) | Nunca fica meio arquivo importado |
| **Hash do conteúdo** impede importar o mesmo histórico duas vezes | Evita duplicar vendas |
| Período que já tem vendas exige **confirmação explícita** | Avisa o risco de duplicar com vendas registradas no sistema |
| Linhas idênticas e dias sem vendas são **avisados**, não removidos | Nunca alterar dados em silêncio |
| **Desfazer** = cancelar as vendas do lote (motivo "Importação desfeita") | Nada é apagado; fica na auditoria |
| Venda importada **não pode ser "corrigida"** | A correção criaria uma venda nova com baixa de estoque numa data antiga |

Consequência: as vendas importadas alimentam a **previsão de produtos**, os relatórios de
vendas e também a **previsão de ingredientes** — neste caso o consumo é **estimado** pela
receita fixa (quantidade × unidades) ou pela composição média do produto por peso (peso × %;
sem o peso no arquivo, peso ≈ valor ÷ preço por kg atual) e a tela marca como "Estimado". Essa
estimativa existe **só na previsão**: não gera movimentação nem altera o saldo, e a correção
pelas contagens de estoque não é aplicada a ela (é de outro período). Vendas importadas também
ficam **fora do lucro bruto e da margem**, porque não têm custo registrado.

Arquivos: [sale-import.service.ts](../../backend/services/sale-import.service.ts),
[sale-import-parser.ts](../../backend/services/sale-import-parser.ts),
migration `20261117000000_importacao_historico`, tela
[import-page.tsx](../../frontend/src/features/sales/import-page.tsx).

## Dados de demonstração

A loja do seed (`demo@gestock.app`) é marcada `is_demo = true`. Todas as telas mostram
**"Ambiente de demonstração — dados simulados."** e o relatório de precisão informa a origem
dos dados. Os dados simulados nunca devem ser apresentados como resultados do parceiro.

## Dependências com alerta de segurança (resolvido em 16/11/2026)

Os 5 alertas altos do back-end foram corrigidos **sem trocar a versão principal do Prisma**:

| Pacote | Correção | Como foi validado |
|---|---|---|
| zod 3.25 | Atualizado para **zod 4.6.7** (a mesma versão do front-end). Ajustes: mensagens de tipo (`error` no lugar de `invalid_type_error`) e `.prefault({})` no lugar de `.default({})` na importação | Todas as suítes (unitários e ponta a ponta) |
| effect / deepmerge-ts (dentro da CLI do Prisma) | `overrides` no `package.json` forçando effect 3.20.0 e deepmerge-ts 8.0.2 | `prisma generate` e `prisma migrate deploy` no banco de teste |

`npm audit --omit=dev`: **0 vulnerabilidades**. Restam 14 alertas baixos/moderados apenas em
ferramentas de desenvolvimento (ESLint, Jest), que não vão para o servidor.
