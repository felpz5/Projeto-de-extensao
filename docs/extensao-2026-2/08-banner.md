# 8. Banner acadêmico — conteúdo

> Rascunho de conteúdo. Ajuste ao modelo e às dimensões exigidas pela UniAteneu.

## Título

**Gestock: previsão de demanda por séries temporais para o controle de estoque de pequenos comércios**

UniAteneu · Projeto de Extensão "Inteligência Artificial Aplicada: Soluções Inteligentes para a
Comunidade" · 2026.2 · Vertente 7 — Previsão de Dados por Séries Temporais
Orientador: Esp. Bruno Jeronimo Pereira · Equipe: _[nomes]_ · Parceiro: _[nome da açaiteria]_

## Introdução

Pequenos comércios decidem compras de insumos sem histórico organizado, o que causa falta de
produto nos dias de maior movimento e desperdício de perecíveis. Séries temporais de vendas
permitem estimar a demanda dos próximos dias de forma simples e verificável.

## Problema

_[Preencher com o diagnóstico real feito com o parceiro — documento 7, item 3.]_

## Objetivos

- Geral: apoiar a decisão de compra de uma açaiteria com previsões de demanda baseadas no
  histórico de vendas e de estoque.
- Específicos: registrar vendas e estoque; prever a demanda diária por produto e o consumo por
  ingrediente; **medir a precisão** das previsões; sugerir quantidades de compra.

## Metodologia

1. Série diária por produto, ingrediente e loja (dias sem venda = 0; dias sem estoque = sem observação).
2. Modelo: nível por média móvel ponderada × fator do dia da semana, com filtro de atípicos (Hampel).
3. Validação: backtesting com janela crescente (origens a cada 7 dias, horizontes 7/14/30),
   sem uso de dados futuros.
4. Métricas: MAE, RMSE e WAPE, comparadas com previsão ingênua, ingênua sazonal e Holt-Winters.
5. Reposição: demanda no período de proteção + margem de segurança z·σ·√(L+R).

## Arquitetura e tecnologias

Aplicação web (React + TypeScript) → API (Node.js + Express) → PostgreSQL com isolamento por
estabelecimento (Row Level Security). Motor estatístico próprio em TypeScript, testado
automaticamente (88 testes unitários, 51 de integração).

## Resultados

- **Técnicos (dados simulados, 120 dias):** erro de 11% (WAPE, 7 dias) na previsão de vendas do
  açaí, 23% menor que a melhor referência simples; o Holt-Winters não trouxe ganho; faixa de
  incerteza calibrada pelo erro medido cobriu 72% dos dias. _Dados
  simulados — não são resultados do parceiro._
- **Com o parceiro:** _[PENDENTE — preencher com o relatório real (documento 4, seção 4.4):
  período de dados, WAPE do Gestock × referência, e o resultado do questionário de eficiência e
  eficácia.]_

## Conclusão

_[Escrever depois dos resultados reais. Sugestão de estrutura: o modelo superou (ou não) a
referência simples nos dados reais; o que o parceiro achou útil; limitações (pouco histórico,
feriados, preço) e próximos passos.]_

## Referências (verificáveis)

> Conferir a formatação ABNT exigida.

- HYNDMAN, R. J.; ATHANASOPOULOS, G. **Forecasting: principles and practice**. 3. ed. Melbourne: OTexts, 2021. Disponível em: https://otexts.com/fpp3/.
- HYNDMAN, R. J.; KOEHLER, A. B. Another look at measures of forecast accuracy. **International Journal of Forecasting**, v. 22, n. 4, p. 679–688, 2006.
- TASHMAN, L. J. Out-of-sample tests of forecasting accuracy: an analysis and review. **International Journal of Forecasting**, v. 16, n. 4, p. 437–450, 2000.
- WINTERS, P. R. Forecasting sales by exponentially weighted moving averages. **Management Science**, v. 6, n. 3, p. 324–342, 1960.
- GARDNER, E. S.; McKENZIE, E. Forecasting trends in time series. **Management Science**, v. 31, n. 10, p. 1237–1246, 1985.
- HAMPEL, F. R. The influence curve and its role in robust estimation. **Journal of the American Statistical Association**, v. 69, n. 346, p. 383–393, 1974.
- SILVER, E. A.; PYKE, D. F.; THOMAS, D. J. **Inventory and production management in supply chains**. 4. ed. Boca Raton: CRC Press, 2017.
