# 4. Validação técnica

## 4.1 Estratégia de backtesting

| Item | Valor |
|---|---|
| Tipo | Origem móvel com **janela crescente** (expanding window) |
| Primeira origem | após 28 dias de treino (14 em séries com menos de 42 dias) |
| Passo entre origens | 7 dias |
| Horizontes | 7, 14 e 30 dias — cada um só nas origens com os H dias reais seguintes |
| Recalcula em cada origem | nível, fatores por dia da semana, σ, parâmetros do Holt-Winters |
| Dados futuros | **nunca**: o modelo recebe `serie.slice(0, origem + 1)` |
| Comparação justa | todos os modelos nas mesmas origens e nos mesmos dias |
| Dias sem estoque | fora das métricas |

**Prova de ausência de vazamento** (teste automatizado em
[forecast-evaluation.spec.ts](../../backend/test/unit/forecast-evaluation.spec.ts)):
1. "NÃO usa dados futuros": trocar todos os valores depois de uma data por 9999 não altera nenhum
   resultado das avaliações feitas antes dela.
2. "a previsão em cada origem é igual a treinar só com o passado": a métrica do backtesting é
   idêntica à de um modelo treinado manualmente só com os dados até a origem.

## 4.2 Modelos comparados

1. **Gestock** — média móvel ponderada + fator do dia da semana (com filtro de atípicos).
2. **Ingênuo** — repete o último dia.
3. **Ingênuo sazonal** — repete o mesmo dia da semana anterior.
4. **Holt-Winters** aditivo amortecido, sazonalidade semanal.

## 4.3 Resultados com DADOS SIMULADOS (loja de demonstração)

> ⚠️ **Dados simulados.** Gerados pelo seed (`backend/prisma/seed.ts`): 120 dias de uma açaiteria
> fictícia, com mais movimento na sexta, sábado e domingo e ruído aleatório. **Não são resultados
> do parceiro** e não podem ser apresentados como tal.
> Arquivo completo: [resultados/precisao-demo-SIMULADO-2026-11-16.md](resultados/precisao-demo-SIMULADO-2026-11-16.md)
> (gerado por `backend/scripts/relatorio-precisao.mjs` em 16/11/2026).

**Horizonte de 7 dias — WAPE (menor é melhor)**

| Série (unidade) | Pares | Origens | Gestock | Ingênuo | Ingênuo sazonal | Holt-Winters |
|---|---:|---:|---:|---:|---:|---:|
| Loja: pedidos/dia | 91 | 13 | **10,3%** | 38,7% | 13,6% | 11,0% |
| Açaí no peso: vendas/dia | 91 | 13 | **11,1%** | 42,8% | 14,5% | 11,6% |
| Milkshake: unidades/dia | 91 | 13 | **35,8%** | 47,7% | 46,0% | 36,8% |
| Ingredientes em g (7 séries) | 637 | 91 | **14,7%** | 39,7% | 20,6% | 15,7% |
| Ingredientes em ml (1 série) | 91 | 13 | **35,8%** | 47,7% | 46,0% | 36,8% |

Em 14 e 30 dias o Gestock manteve o menor erro nas séries de volume alto; nas de pouco volume
(milkshake, leite, copos) o Holt-Winters ficou **0,1 ponto** melhor a 14 dias (36,0% × 36,1%) —
empate na prática (ver arquivo completo).

**Cobertura da faixa no açaí no peso** (fração dos valores reais dentro dela):

| Horizonte | Diária, só σ do modelo | Diária **calibrada** (mostrada) | Total, σ·√H | Total **calibrada** (σ·√H·k) |
|---|---:|---:|---:|---:|
| 7 dias | 61,5% | **72,5%** | 46,2% | 53,8% |
| 14 dias | 65,5% | **73,2%** | 50,0% | 58,3% |
| 30 dias | 67,4% | **71,5%** | 55,6% | 66,7% |

Referência: ±1σ cobriria ~68% se os erros fossem normais. A faixa diária calibrada ficou no
nível esperado; a do total melhorou, mas ainda abaixo (fator k = 1,39 nesta série).

### Interpretação

- **Qual modelo errou menos?** O Gestock em todas as séries a 7 dias e nas de volume alto em
  todos os horizontes; nas de pouco volume, empate com o Holt-Winters a 14 dias. Ganho sobre a melhor referência simples (ingênuo sazonal) no açaí no peso, 7 dias:
  **23% menos erro (MAE)**.
- **Onde funciona melhor/pior?** Melhor em séries de volume alto (pedidos, açaí no peso, ~10–11%).
  Pior em itens de volume baixo (milkshake, ~5 por dia: 36%) e em ingredientes de uso raro
  (paçoca: 37%) — com poucos itens por dia, a variação aleatória pesa mais.
- **Há vantagem sobre a previsão simples?** Nos dados simulados, sim. **Mas atenção à
  circularidade:** o gerador de dados embute exatamente o padrão que o modelo procura (efeito
  de fim de semana). Isso mostra que o modelo **funciona como projetado**, não que ele acerta no
  mundo real.
- **Por que o Holt-Winters não foi adotado?** O ganho foi nulo ou negativo nos dados
  disponíveis; ele é mais difícil de explicar e de ajustar. A decisão deve ser revista com os
  dados reais.
- **A faixa é confiável?** A diária, sim: calibrada pelo erro medido, cobriu 72–73% dos dias
  (esperado ~68%). A do total ainda fica abaixo do nominal (54–67%), mesmo com o fator de
  correlação — limitação registrada no documento 3.

### Limitações destes testes

- Dados simulados, sem eventos reais (feriados, chuva, falta de produto, promoções).
- 120 dias: avalia padrão semanal, não sazonalidade anual.
- Poucas séries por grupo (1 produto por peso, 1 por unidade).

## 4.4 Resultados com DADOS REAIS do parceiro

> **Ainda não disponíveis.** Nenhum dado real foi fornecido até 16/11/2026. Esta seção deve ser
> preenchida pela equipe **somente** com o relatório gerado a partir dos dados da açaiteria.

### Como gerar os resultados reais

1. Criar a conta da açaiteria (cadastro no próprio site) e cadastrar os produtos com os mesmos
   nomes usados no caderno/planilha.
2. Digitar ou exportar o histórico para uma planilha (modelo em **Vendas → Importar histórico →
   Modelo de planilha**) e salvar como CSV.
3. Importar em **Vendas → Importar histórico** (conferir, corrigir erros, confirmar).
4. Para ingredientes: lançar o estoque inicial e fazer contagens periódicas (a previsão de
   consumo usa as movimentações de estoque, não as vendas importadas).
5. Gerar o relatório (dono ou gerente):

   ```bash
   cd backend
   GESTOCK_EMAIL=<email-do-dono> GESTOCK_PASSWORD=<senha> \
     node scripts/relatorio-precisao.mjs https://<endereço-do-gestock>/api 120 \
     > ../docs/extensao-2026-2/resultados/precisao-REAL-AAAA-MM-DD.md
   ```

6. Conferir no topo do relatório: "Origem dos dados: registrados/importados" (não "DEMONSTRAÇÃO").
7. Preencher a tabela abaixo e reescrever a interpretação **com base nos números reais**.

| Série | Pares | Origens | Gestock | Ingênuo | Ingênuo sazonal | Holt-Winters |
|---|---:|---:|---:|---:|---:|---:|
| _pendente_ | | | | | | |

Mínimo recomendado para uma conclusão: **≥ 8 semanas** de histórico diário (resulta em ≥ 4
origens no horizonte de 7 dias) — abaixo disso a tela marca o resultado como preliminar.

## 4.5 Conclusões sustentadas pelas evidências atuais

1. O sistema faz **previsão por séries temporais** (não só estatística descritiva) — verificado
   no código e nos testes.
2. A precisão é **medida fora da amostra**, sem vazamento de dados futuros — verificado por teste.
3. Nos dados **simulados**, o modelo supera as referências simples e empata ou supera o
   Holt-Winters.
4. **Não é possível afirmar** ainda a precisão no estabelecimento real nem o benefício para o
   parceiro: isso depende dos dados reais (4.4) e da validação externa (documento 7).
