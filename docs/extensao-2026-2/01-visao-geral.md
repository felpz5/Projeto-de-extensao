# 1. Visão geral

## Problema identificado

Pequenos estabelecimentos — como a açaiteria parceira — controlam vendas e estoque de forma
manual (caderno, memória do dono). A compra de insumos é decidida "no olho". As consequências
são previsíveis:

- **ruptura**: falta ingrediente no dia de maior movimento (fim de semana);
- **excesso e perda**: compra demais de itens perecíveis;
- **nenhum histórico consultável** para planejar.

> A descrição do problema acima é a hipótese da equipe a partir da especificação do projeto.
> O **diagnóstico com o parceiro** (entrevista, observação) precisa ser registrado pela equipe
> — ver [documento 7](07-evidencias-da-extensao.md).

## Público-alvo

Pequenos comércios que vendem produtos com consumo de insumos (açaiterias, sorveterias,
lanchonetes, mercadinhos). Primeiro ambiente de validação: **uma açaiteria em Fortaleza/CE**.
O sistema é genérico: cada estabelecimento tem a sua conta, com dados isolados.

## Objetivo da solução

Transformar o histórico de vendas e de estoque em **previsões de demanda** e **sugestões de
compra**, com a precisão **medida** e as limitações explicadas, para apoiar — não substituir —
a decisão do comerciante.

## Funcionalidades principais

| Grupo | O que faz |
|---|---|
| Operação | Venda no balcão (por peso) e online (com ingredientes escolhidos), caixa do dia, cancelamento com estorno |
| Estoque | Livro-razão de entradas e saídas, contagem física, alertas de estoque baixo |
| Cadastros | Produtos, ingredientes, receitas fixas e composição média dos produtos por peso |
| **Previsão** | Demanda diária por produto e consumo por ingrediente para 1–30 dias, em **faixa** |
| **Precisão** | Backtesting: compara as previsões passadas com o que aconteceu (MAE, RMSE, WAPE) e com modelos de referência |
| **Reposição** | Quanto comprar de cada ingrediente, com margem de segurança e explicação do cálculo |
| **Histórico** | Importação de vendas antigas (CSV do caderno/planilha) para alimentar a previsão desde o início |
| Gestão | Indicadores, relatórios, comparação com o período anterior, auditoria, equipe com papéis |

## Benefícios esperados (a confirmar com o parceiro)

- Comprar a quantidade certa antes do fim de semana (menos ruptura).
- Menos desperdício de insumos perecíveis.
- Histórico organizado, consultável e exportável.

Os benefícios só podem ser afirmados **depois** da validação com o parceiro (questionário de
eficiência e eficácia). Até lá são hipóteses.

## Relação com a vertente 7 (Previsão de Dados por Séries Temporais)

| Exigência da vertente | No Gestock |
|---|---|
| Série temporal | Vendas e consumo agregados **por dia**, em ordem cronológica, com dias sem venda = 0 e dias sem estoque = sem observação |
| Modelo de previsão | Decomposição multiplicativa: nível por média móvel ponderada + fator por dia da semana ([documento 3](03-metodologia-estatistica.md)) |
| Previsão do futuro | Horizonte de 1 a 30 dias, por produto e ingrediente, com faixa de incerteza |
| Fundamentação e validação | Backtesting com janela crescente, MAE/RMSE/WAPE, comparação com ingênuo, ingênuo sazonal e Holt-Winters ([documento 4](04-validacao-tecnica.md)) |
| Aplicação real | Recomendação de compra para a açaiteria parceira |

**Não há IA generativa nem redes neurais**, e isso é intencional: a vertente 7 admite técnicas
estatísticas, e o volume de dados de uma loja pequena (semanas a meses de registros diários)
não justifica modelos mais complexos — o que foi **verificado**, não presumido: o
Holt-Winters, mais sofisticado, foi implementado e comparado: nos dados **simulados** de teste
ele não superou o modelo atual no horizonte de 7 dias e só empatou (0,1 ponto de diferença) em
itens de pouco volume a 14 dias — complexidade sem ganho relevante. A comparação com dados reais é refeita automaticamente quando o
histórico do parceiro for importado.
