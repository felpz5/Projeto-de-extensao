# 9. Roteiro de apresentação (≈ 15 min)

Preparação: Gestock no ar, conta do parceiro com o histórico importado (ou a loja demo,
**dizendo em voz alta que os dados são simulados**), relatório de precisão impresso.

| # | Tempo | Mostrar | Falar |
|---|---|---|---|
| 1 | 1 min | — | **Problema:** a açaiteria compra insumos "no olho"; falta açaí no sábado e sobra creme na terça. _[usar o diagnóstico real]_ |
| 2 | 1 min | Página inicial | **Objetivo:** usar o histórico de vendas para prever a demanda e sugerir compras, com o erro medido. |
| 3 | 2 min | Nova venda (balcão por peso e online) · Estoque | **Funcionamento geral:** cada venda e cada entrada viram registros datados; o estoque é um livro-razão. |
| 4 | 1 min | Vendas → Importar histórico | **Histórico:** o caderno vira CSV; o sistema confere linha a linha e não mexe no estoque atual. |
| 5 | 2 min | Previsão → Demanda → Detalhes do açaí | **Modelo:** "média das últimas 4 semanas, os dias recentes pesando mais, ajustada pelo dia da semana". Mostrar o texto "Como esta previsão é calculada". |
| 6 | 1 min | Gráfico real × previsto | **Previsão futura:** barras = vendido; linha tracejada = previsto; sombra = faixa. |
| 7 | 3 min | Tabela "Precisão nas avaliações históricas" · aba Precisão do modelo | **Como sabemos se acerta:** o sistema volta no tempo, prevê sem ver o futuro e compara. Erro (WAPE) do Gestock × repetir a semana anterior × Holt-Winters. |
| 8 | 2 min | Reposição → abrir um ingrediente | **Recomendação:** demanda no prazo de entrega + até a próxima compra + margem de segurança − saldo. Ler o texto da sugestão. |
| 9 | 1 min | — | **Resultados:** _[números REAIS do relatório; se ainda não houver, dizer que os mostrados são simulados]_ |
| 10 | 1 min | Avisos na tela | **Limitações:** pouco histórico, feriados, preço, falta de estoque, previsão ≠ certeza. |
| 11 | — | — | **Benefícios para o parceiro:** _[usar o questionário e o feedback reais]_ |

## Explicação simples do algoritmo (para leigos)

> "Pegamos as vendas dos últimos 28 dias e fazemos uma média em que ontem conta mais do que
> o mês passado. Depois olhamos, nos últimos 3 meses, quanto cada dia da semana costuma vender a
> mais ou a menos — o sábado, por exemplo, vende 40% acima da média. A previsão de um sábado é
> a média vezes 1,4. Dias completamente fora do normal, como uma festa, não puxam a média. E
> para saber se isso funciona, o sistema finge estar em datas passadas, prevê a semana seguinte
> sem olhar o que aconteceu e compara com o que realmente foi vendido."

## Perguntas prováveis da banca

**O projeto realmente utiliza Inteligência Artificial?**
Utiliza **previsão estatística de séries temporais**, que é a vertente 7 do edital ("técnicas
estatísticas ou ferramentas como Prophet"). Não usamos IA generativa nem redes neurais, e não
dizemos que usamos. O sistema aprende os padrões dos dados (nível e efeito do dia da semana) e
os recalcula a cada dia com os dados novos.

**Por que a vertente de previsão?**
Porque o problema do parceiro é de planejamento de compras, e o dado que ele tem é histórico
de vendas por dia — exatamente uma série temporal.

**Qual a diferença entre estatística descritiva e preditiva?**
Descritiva resume o passado (faturamento do mês, ticket médio, mais vendidos — o Gestock também
tem). Preditiva estima o futuro (quantos potes no próximo sábado) e precisa ser validada
contra o que acontece depois — que é o backtesting.

**Por que não utilizaram Prophet?**
O Prophet brilha com histórico longo (anos) e vários tipos de sazonalidade; uma loja pequena tem
semanas a meses de dados diários. Ele exigiria um serviço em Python à parte e seria mais difícil
de explicar. Testamos um método mais sofisticado que o nosso (Holt-Winters): nos dados
disponíveis ele errou mais a 7 dias e só empatou em alguns itens a 14 — complexidade sem ganho
medido.

**Como sabem se a previsão está correta?**
Ela nunca está "correta"; medimos **quanto erra**. Backtesting: o sistema prevê a partir de
datas passadas usando só os dados anteriores a cada data, compara com o real e calcula MAE,
RMSE e WAPE. E compara com uma previsão "boba" (repetir a semana passada): se o modelo não
for melhor que isso, a tela avisa.

**Qual é o erro médio?**
_[Ler do relatório REAL.]_ Nos dados simulados: cerca de 11% (WAPE) para as vendas diárias do
açaí em 7 dias, 23% menos erro que repetir a semana anterior. Itens de pouco volume erram mais
(~36%).

**Como lidam com pouco histórico?**
Com menos de 7 dias o sistema não prevê. Até 4 semanas não usa o efeito do dia da semana. A
precisão só é mostrada quando há avaliações suficientes; antes disso aparece "Histórico
insuficiente para avaliar a precisão" ou "preliminar". E dá para importar o histórico do caderno.

**Como os dados são protegidos?**
Cada loja só enxerga os próprios dados por regra do **banco** (Row Level Security), não só do
código; senhas com Argon2; sessão com token curto e cookie protegido; previsão e importação só
para dono e gerente; testes automáticos verificam que outra loja não acessa nada.

**Qual benefício concreto a empresa recebeu?**
_[Responder só com o que o parceiro relatou no questionário/feedback. Não antecipar.]_
