# Precisão da previsão — Açaiteria Demo

- Gerado em: 2026-11-16 (previsões para a partir de 2026-11-16)
- Origem dos dados: **DEMONSTRAÇÃO — dados SIMULADOS (não são resultados do parceiro)**
- Histórico analisado: últimos 120 dias
- Método: backtesting com janela crescente (origens a cada 7 dias, treino mínimo de 28 dias); cada previsão usa só os dados anteriores à data simulada.
- Métricas por dia previsto: MAE e RMSE na unidade da série; WAPE = Σ|erro| ÷ Σ|real|.

## Loja: pedidos por dia (pedidos)

Séries: 1 · com avaliação: 1

**Horizonte 7 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 91 | 13 | 3.29 | 3.94 | 10.3% | -0.01 |
| Ingênuo (repete o último dia) | 91 | 13 | 12.32 | 14.80 | 38.7% | 10.03 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 91 | 13 | 4.34 | 5.57 | 13.6% | -0.10 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 91 | 13 | 3.49 | 4.20 | 11.0% | 0.06 |

**Horizonte 14 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 168 | 12 | 3.25 | 3.91 | 10.2% | 0.10 |
| Ingênuo (repete o último dia) | 168 | 12 | 12.50 | 14.76 | 39.4% | 9.98 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 168 | 12 | 4.37 | 5.49 | 13.8% | -0.05 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 168 | 12 | 3.44 | 4.15 | 10.8% | 0.11 |

**Horizonte 30 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 270 | 9 | 3.26 | 3.92 | 10.3% | 0.60 |
| Ingênuo (repete o último dia) | 270 | 9 | 12.69 | 15.09 | 40.2% | 10.80 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 270 | 9 | 4.34 | 5.42 | 13.8% | 0.36 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 270 | 9 | 3.35 | 4.06 | 10.6% | 0.61 |

## Produtos: vendas (potes) por dia (vendas)

Séries: 1 · com avaliação: 1

**Horizonte 7 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 91 | 13 | 3.04 | 3.80 | 11.1% | 0.06 |
| Ingênuo (repete o último dia) | 91 | 13 | 11.69 | 14.07 | 42.8% | 10.07 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 91 | 13 | 3.97 | 5.14 | 14.5% | -0.08 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 91 | 13 | 3.17 | 3.99 | 11.6% | 0.13 |

**Horizonte 14 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 168 | 12 | 3.02 | 3.80 | 11.1% | 0.24 |
| Ingênuo (repete o último dia) | 168 | 12 | 11.86 | 14.16 | 43.6% | 10.21 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 168 | 12 | 4.01 | 5.01 | 14.8% | 0.07 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 168 | 12 | 3.15 | 3.96 | 11.6% | 0.27 |

**Horizonte 30 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 270 | 9 | 3.06 | 3.87 | 11.3% | 0.60 |
| Ingênuo (repete o último dia) | 270 | 9 | 12.06 | 14.33 | 44.4% | 10.72 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 270 | 9 | 3.96 | 4.97 | 14.6% | 0.44 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 270 | 9 | 3.13 | 3.91 | 11.5% | 0.69 |

## Produtos: unidades vendidas por dia (un)

Séries: 1 · com avaliação: 1

**Horizonte 7 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 91 | 13 | 1.61 | 2.00 | 35.8% | -0.13 |
| Ingênuo (repete o último dia) | 91 | 13 | 2.14 | 2.76 | 47.7% | -0.03 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 91 | 13 | 2.07 | 2.58 | 46.0% | -0.02 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 91 | 13 | 1.65 | 2.08 | 36.8% | -0.22 |

**Horizonte 14 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| Gestock (média ponderada + dia da semana) | 168 | 12 | 1.62 | 2.01 | 36.1% | -0.20 |
| Ingênuo (repete o último dia) | 168 | 12 | 2.06 | 2.69 | 45.9% | -0.24 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 168 | 12 | 2.00 | 2.55 | 44.6% | -0.12 |
| **Holt-Winters aditivo amortecido (sazonalidade semanal)** | 168 | 12 | 1.61 | 2.06 | 36.0% | -0.36 |

**Horizonte 30 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 270 | 9 | 1.62 | 1.98 | 37.2% | -0.06 |
| Ingênuo (repete o último dia) | 270 | 9 | 2.06 | 2.59 | 47.2% | 0.08 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 270 | 9 | 2.12 | 2.58 | 48.6% | -0.08 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 270 | 9 | 1.64 | 1.99 | 37.5% | -0.38 |

## Ingredientes: consumo em g por dia (g)

Séries: 7 · com avaliação: 7

**Horizonte 7 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 637 | 91 | 209.07 | 455.49 | 14.7% | 2.41 |
| Ingênuo (repete o último dia) | 637 | 91 | 564.71 | 1103.73 | 39.7% | 388.85 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 637 | 91 | 292.88 | 674.05 | 20.6% | -7.74 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 637 | 91 | 223.58 | 490.29 | 15.7% | 6.40 |

**Horizonte 14 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 1176 | 84 | 204.74 | 445.87 | 14.5% | 14.58 |
| Ingênuo (repete o último dia) | 1176 | 84 | 566.83 | 1110.91 | 40.2% | 382.62 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 1176 | 84 | 278.69 | 641.62 | 19.7% | 2.62 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 1176 | 84 | 215.60 | 474.14 | 15.3% | 15.72 |

**Horizonte 30 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 1890 | 63 | 210.44 | 452.64 | 15.0% | 44.00 |
| Ingênuo (repete o último dia) | 1890 | 63 | 551.31 | 1092.92 | 39.3% | 384.74 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 1890 | 63 | 264.01 | 603.02 | 18.8% | 24.55 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 1890 | 63 | 217.33 | 474.40 | 15.5% | 43.94 |

Menor erro do Gestock (7 dias): Banana (12.8%), Granola (13.7%), Leite condensado (13.7%)
Maior erro do Gestock (7 dias): Paçoca (36.7%), Açaí tradicional (15.0%), Creme de cupuaçu (14.6%)

## Ingredientes: consumo em ml por dia (ml)

Séries: 1 · com avaliação: 1

**Horizonte 7 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 91 | 13 | 321.53 | 400.75 | 35.8% | -26.38 |
| Ingênuo (repete o último dia) | 91 | 13 | 428.57 | 552.72 | 47.7% | -6.59 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 91 | 13 | 413.19 | 516.97 | 46.0% | -4.40 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 91 | 13 | 330.39 | 415.54 | 36.8% | -44.65 |

**Horizonte 14 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| Gestock (média ponderada + dia da semana) | 168 | 12 | 324.07 | 402.26 | 36.1% | -40.03 |
| Ingênuo (repete o último dia) | 168 | 12 | 411.90 | 538.52 | 45.9% | -47.62 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 168 | 12 | 400.00 | 509.44 | 44.6% | -23.81 |
| **Holt-Winters aditivo amortecido (sazonalidade semanal)** | 168 | 12 | 323.00 | 410.91 | 36.0% | -72.33 |

**Horizonte 30 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 270 | 9 | 324.44 | 395.16 | 37.2% | -11.49 |
| Ingênuo (repete o último dia) | 270 | 9 | 411.85 | 518.12 | 47.2% | 16.30 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 270 | 9 | 423.70 | 515.82 | 48.6% | -16.30 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 270 | 9 | 327.08 | 398.51 | 37.5% | -75.23 |

## Ingredientes: consumo em un por dia (un)

Séries: 1 · com avaliação: 1

**Horizonte 7 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 91 | 13 | 1.61 | 2.00 | 35.8% | -0.13 |
| Ingênuo (repete o último dia) | 91 | 13 | 2.14 | 2.76 | 47.7% | -0.03 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 91 | 13 | 2.07 | 2.58 | 46.0% | -0.02 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 91 | 13 | 1.65 | 2.08 | 36.8% | -0.22 |

**Horizonte 14 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| Gestock (média ponderada + dia da semana) | 168 | 12 | 1.62 | 2.01 | 36.1% | -0.20 |
| Ingênuo (repete o último dia) | 168 | 12 | 2.06 | 2.69 | 45.9% | -0.24 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 168 | 12 | 2.00 | 2.55 | 44.6% | -0.12 |
| **Holt-Winters aditivo amortecido (sazonalidade semanal)** | 168 | 12 | 1.61 | 2.06 | 36.0% | -0.36 |

**Horizonte 30 dias**

| Modelo | Pares avaliados | Origens | MAE | RMSE | WAPE | Viés |
|---|---:|---:|---:|---:|---:|---:|
| **Gestock (média ponderada + dia da semana)** | 270 | 9 | 1.62 | 1.98 | 37.2% | -0.06 |
| Ingênuo (repete o último dia) | 270 | 9 | 2.06 | 2.59 | 47.2% | 0.08 |
| Ingênuo sazonal (repete o mesmo dia da semana anterior) | 270 | 9 | 2.12 | 2.58 | 48.6% | -0.08 |
| Holt-Winters aditivo amortecido (sazonalidade semanal) | 270 | 9 | 1.64 | 1.99 | 37.5% | -0.38 |

> Em negrito, o modelo com menor MAE em cada horizonte. Resultados com poucas origens são preliminares.
