# 5. Plano de testes

## 5.1 Suítes automatizadas

| Suíte | Ferramenta | Onde | O que cobre |
|---|---|---|---|
| Unitários do back-end | Jest | `backend/test/unit/` | Fórmulas, modelos, backtesting, importação (sem banco) |
| Ponta a ponta (integração) | Jest + Supertest + PostgreSQL real | `backend/test/e2e/app.e2e-spec.ts` | API inteira com RLS, permissões, estoque, vendas, previsão, importação |
| Front-end | Vitest | `frontend/src/**/*.test.ts` | Formatação, leitura de números, leitura de CSV |
| Tipos e estilo | TypeScript, ESLint, Prettier | back e front | Erros de tipo, padrão de código |

## 5.2 Testes estatísticos (unitários)

[forecast-engine.spec.ts](../../backend/test/unit/forecast-engine.spec.ts) e
[forecast-evaluation.spec.ts](../../backend/test/unit/forecast-evaluation.spec.ts):

| Caso | Verifica |
|---|---|
| Série constante | previsão = valor, faixa sem largura |
| Sazonalidade semanal | fim de semana previsto maior que dia útil |
| Loja fechada num dia da semana | previsto 0 naquele dia |
| Séries com zeros / intermitentes | parcela de zeros informada; limite inferior ≥ 0 |
| Dias sem observação (sem estoque) | não contam como zero; menos de 7 observados → não prevê |
| Valor discrepante | filtro de Hampel limita o pico (efeito < 2 unidades) |
| Séries curtas | "histórico insuficiente" (previsão e precisão) |
| Horizontes diferentes | 1, 7, 14, 30 dias geram exatamente esse número de dias |
| **Ausência de vazamento temporal** | mudar o futuro não altera avaliações passadas; métrica = treino manual só com o passado |
| MAE, RMSE, WAPE, viés | valores conhecidos calculados à mão; RMSE ≥ MAE; WAPE indefinida com reais zerados |
| Comparação de modelos | mesmos dias para todos; horizonte sem futuro não é avaliado; contagem de avaliações |
| Referências | ingênuo, ingênuo sazonal (inclusive h > 7), Holt-Winters (sazonal, tendência, ≥ 0) |
| Cobertura da faixa | fração de dias reais dentro da faixa, só para modelos com faixa |
| Calibração da faixa | faixa calibrada cobre ≥ a do modelo; usa só erros já conhecidos (sem vazamento); sem erros suficientes não calibra; fator de correlação > 1 com erros que se repetem por semanas e ≈ 1 com ruído independente |
| Ruptura longa | 30 dias sem estoque não viram previsão zero |
| Dias sem estoque | o dia em que o estoque inicial chega não é marcado; dia com saída nunca é marcado |
| Holt-Winters com dias faltando | estado inicial ignora dias sem observação |
| Agregação por unidade | WAPE conjunta = Σ|erro| ÷ Σ|real| das séries |
| Reposição | √(L+R) na margem; erro medido usado quando maior; dias até acabar seguem a semana; sem histórico não inventa quantidade |

## 5.3 Testes de importação

Unitários ([sale-import.spec.ts](../../backend/test/unit/sale-import.spec.ts)): números pt-BR
e internacionais, datas ISO e brasileiras, data inexistente (31/02), hora, nome de produto sem
acento, erro por linha (data futura, data antiga, produto inexistente, quantidade negativa,
produto por peso sem valor, canal desconhecido), produto padrão, valor pelo preço atual, nome
de produto duplicado, resumo do período (dias sem registro, linhas idênticas), hash do conteúdo.

Ponta a ponta: funcionário recebe 403; arquivo com erro não grava nada (422); importação
**não altera o saldo de estoque**; mesmo conteúdo → 409; período com vendas exige confirmação
(409 → 201 com `allowOverlap`); venda importada não pode ser corrigida (409); desfazer cancela
as vendas (nada apagado) e libera reimportar; o histórico importado estima o consumo do
ingrediente pela receita **sem** alterar o saldo; vendas importadas ficam fora do lucro bruto.

## 5.4 Segurança e isolamento entre lojas

Ponta a ponta: outra loja não vê lotes de importação (lista vazia), não desfaz (404) e não vê a
previsão de um produto alheio (404); relatório de precisão e reposição bloqueados para
funcionário (403); parâmetro inválido → 422. As suítes anteriores já cobrem login, sessão,
rotação de refresh token, RLS em todas as tabelas e permissões por papel.

## 5.5 Regressão

As 37 verificações ponta a ponta que existiam antes desta etapa continuam na suíte. Duas foram
**ajustadas** (não removidas) porque o comportamento mudou de propósito: o selo de "confiança"
por quantidade de dias foi substituído por `historyLevel` + precisão medida.

## 5.6 Comandos e resultados (executados em 16/11/2026)

```bash
# back-end
cd backend
npx tsc --noEmit && npx eslint . && npx prettier --check "**/*.ts"
npx jest                                   # unitários
# ponta a ponta: banco isolado (docker compose -p gestock-teste ...) com o usuário sem BYPASSRLS
DATABASE_URL=postgresql://gestock_app:...@localhost:35432/gestock \
DIRECT_URL=postgresql://postgres:...@localhost:35432/gestock \
JWT_ACCESS_SECRET=... NODE_ENV=test npx jest --config test/jest-e2e.json --runInBand

# front-end (no Windows, rode a partir de C:\ com "C" maiúsculo)
cd frontend
npx tsc --noEmit && npm test && npm run build
```

| Suíte | Resultado |
|---|---|
| TypeScript (back e front), ESLint (back), Prettier (back) | sem erros |
| Unitários do back-end | **88 de 88** passaram |
| Ponta a ponta | **51 de 51** passaram (37 anteriores + 14 novos) |
| Front-end (Vitest) | **19 de 19** passaram |
| Build de produção do front | concluído |

**Não executado:** auditoria de acessibilidade com ferramenta (ex.: axe) e testes em
navegadores/aparelhos físicos. As telas novas foram conferidas por captura em Chrome
(computador 1366 px e celular 390 px).

## 5.7 Teste com o parceiro (a executar pela equipe)

| Etapa | Critério de aceite |
|---|---|
| Importar o histórico real | relatório de conferência sem erros; saldo de estoque inalterado |
| Gerar o relatório de precisão real | origem "registrados/importados"; ≥ 4 origens em 7 dias |
| Comparar com a referência | registrar se o Gestock errou menos que o ingênuo sazonal (sem forçar conclusão) |
| Acompanhar 2–4 semanas | anotar previsto × vendido na semana e sugestões de compra usadas ou não |
| Questionário | aplicado e assinado pelo responsável (documento 7) |
