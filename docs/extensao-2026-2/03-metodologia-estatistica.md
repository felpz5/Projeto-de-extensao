# 3. Metodologia estatística

Tudo o que está aqui corresponde ao código em
[forecast-engine.ts](../../backend/services/forecast-engine.ts) e
[forecast-evaluation.ts](../../backend/services/forecast-evaluation.ts).

## 3.1 Origem dos dados

| Série | Variável prevista | Fonte |
|---|---|---|
| Produto vendido por unidade | unidades vendidas por dia | `sale_items.quantity` de vendas **concluídas** (canceladas ficam de fora), registradas ou importadas |
| Produto vendido por peso (açaí) | número de vendas (potes) por dia | idem — o consumo em gramas é previsto pelos ingredientes |
| Ingrediente | consumo por dia (g, ml ou un) | saídas de estoque (vendas, saídas manuais, perdas), corrigidas pelas contagens; lançamentos estornados ficam de fora; **mais** o consumo estimado das vendas importadas (receita ou composição) |
| Loja | pedidos por dia | contagem de vendas concluídas |

Unidades diferentes **nunca são somadas nem comparadas entre si** (relatório agregado por
unidade).

## 3.2 Preparação da série temporal

1. Agregação **por dia no fuso do estabelecimento**.
2. Janela: do primeiro registro (ou da primeira venda importada) até **ontem** (o dia de hoje está incompleto e fica de fora),
   limitada aos últimos 120 dias (configurável de 28 a 365 na tela).
3. **Dia sem venda = 0** (a loja abriu e não vendeu aquele produto).
4. **Dia sem estoque = sem observação** (`null`), só para ingredientes: se o saldo no início do
   dia era ≤ 0 e nada foi consumido, a demanda daquele dia **não pôde acontecer** — tratá-la
   como zero faria o modelo subestimar a demanda. Esses dias ficam de fora do ajuste e das
   métricas, e a tela avisa quantos foram.
5. Consumo corrigido pela contagem física: se o inventário mostra que se gastou mais (ou menos)
   do que as baixas registradas, a diferença é distribuída **proporcionalmente** nos dias do
   período (não cria um pico no dia da contagem).

## 3.3 Modelo Gestock (decomposição multiplicativa)

**Previsão para o dia t + h:**

    ŷ(t+h) = N × F[dia da semana de t+h]

### Fator do dia da semana F (a partir de 28 dias de histórico)

Nos últimos 84 dias observados, para cada dia da semana d:

    F[d] = média(valores do dia d, com atípicos limitados) ÷ média geral

- F = 1 é um dia "normal"; F = 1,4 vende 40% acima da média.
- Dia da semana com menos de 2 observações → F = 1 (sem evidência).
- Dia em que a loja nunca vende (F = 0) é previsto como 0.
- Com menos de 28 dias, todos os fatores são 1 (`historyLevel = SHORT`).

### Nível N (média móvel ponderada linear)

Nos últimos 28 dias, cada valor é dessazonalizado (y ÷ F) e entra com peso igual à sua posição
no calendário (1 = o dia mais antigo da janela, 28 = ontem):

    N = Σ wᵢ · ỹᵢ ÷ Σ wᵢ ,   ỹᵢ = yᵢ / F[dᵢ]

### Valores atípicos (filtro de Hampel)

Antes de calcular N, e também dentro de cada dia da semana antes de calcular F:

    limite = mediana ± 3 × 1,4826 × MAD

(MAD = mediana dos desvios absolutos à mediana; 1,4826·MAD estima o desvio padrão na normal.)
Valores fora do limite são **limitados ao limite** só no cálculo — os registros não são
alterados. Se MAD = 0 (ex.: a maioria dos dias igual ou zerada) nada é limitado. Teste: um pico
de 500 numa série em torno de 11 muda a previsão em menos de 2 unidades (sem o filtro, ~34).

### Faixa de incerteza (calibrada pelo erro medido)

    σ_modelo = desvio padrão dos resíduos (y − N·F) na janela de 28 dias
    σ_erro   = RMSE dos erros fora da amostra (dias 1–7 de todas as simulações do backtesting)
    σ        = max(σ_modelo, σ_erro)          (σ_erro só com ≥ 14 erros medidos)
    k        = max(1, RMSE do erro da soma de 7 dias ÷ (σ·√7))   (k só com ≥ 4 somas medidas)
    faixa diária         = [max(0, ŷ − σ), ŷ + σ]
    faixa do total em H  = Σŷ ± σ·√H·k

- O limite inferior nunca é negativo.
- **Por que calibrar:** σ_modelo é medido dentro da amostra e subestima o erro real (nos dados
  simulados a faixa só com ele cobria 62% dos dias, contra ~68% esperados para ±1σ).
- **Por que k:** σ·√H supõe erros diários independentes. Se os erros se repetem em dias
  seguidos (semanas inteiras acima ou abaixo), a soma erra mais; k mede isso. k = 1 quando os
  erros são independentes.
- **Sem vazamento:** no backtesting, a faixa de cada data simulada usa σ_erro e k calculados
  **só com os erros já conhecidos naquela data**; é a cobertura dessa faixa que a tela mostra.
  Teste: "a calibração também não usa o futuro".

### Dados insuficientes

- Menos de **7 dias observados**: não prevê; responde "Histórico insuficiente" e quantos dias faltam.
- 7 a 27 dias: só nível (sem padrão semanal).
- O antigo selo "confiança alta/média/baixa" baseado só na quantidade de dias **foi removido**.
  A confiabilidade agora vem do **erro medido** (seção 3.6).

## 3.4 Modelos de referência (comparação)

| Modelo | Fórmula | Para quê |
|---|---|---|
| Ingênuo | ŷ(t+h) = y(t) (último dia observado) | Referência mínima |
| Ingênuo sazonal | ŷ(t+h) = y(t + h − 7k), k = ⌈h/7⌉ (mesmo dia da semana anterior) | Referência forte para séries com padrão semanal |
| Holt-Winters aditivo amortecido | ℓ, b, s atualizados a cada dia (abaixo) | Alternativa mais sofisticada, com tendência |

**Holt-Winters** (sazonalidade m = 7, aditiva porque há dias com zero):

    ℓt = α(yt − s(t−7)) + (1 − α)(ℓ(t−1) + φ·b(t−1))
    bt = β(ℓt − ℓ(t−1)) + (1 − β)·φ·b(t−1)
    st = γ(yt − ℓt) + (1 − γ)·s(t−7)
    ŷ(t+h) = ℓt + (φ + φ² + … + φʰ)·bt + s(t+h−7k)

Parâmetros escolhidos por grade (α ∈ {0,1; 0,2; 0,3; 0,5}, β ∈ {0; 0,05; 0,15},
γ ∈ {0,05; 0,15; 0,3}, φ ∈ {0,8; 0,9; 0,98}) minimizando o erro de 1 passo **dentro do
treino**. Precisa de 14+ dias. Estado inicial pelas duas primeiras semanas, **ignorando dias sem
observação** (tratá-los como zero puxaria o nível e o fator daquele dia para baixo).

**Decisão:** o Holt-Winters **não substituiu** o modelo Gestock. Nos dados simulados ele errou
mais no horizonte de 7 dias em todos os grupos e empatou (0,1 ponto) em itens de pouco volume a
14 dias (documento 4). Ele continua sendo calculado e mostrado na tela de precisão, e a decisão
deve ser revista com os dados reais.

## 3.5 Horizonte

1 a 30 dias (padrão 7) na tela de demanda. Na reposição, o horizonte é o **período de
proteção** P = prazo de entrega (L) + dias até a próxima compra (R).

## 3.6 Avaliação da precisão (resumo — detalhes no documento 4)

- **Backtesting com janela crescente**: origens a cada 7 dias, treino mínimo de 28 dias (14 em
  séries curtas); em cada origem o modelo recebe **só** os dados até aquela data e recalcula
  nível, fatores e parâmetros.
- Horizontes de 7, 14 e 30 dias, cada um só nas origens que têm os H dias seguintes.
- Todos os modelos avaliados **nas mesmas origens e dias**.
- Métricas:

      MAE  = (1/n) Σ |yᵢ − ŷᵢ|
      RMSE = √[(1/n) Σ (yᵢ − ŷᵢ)²]
      WAPE = Σ |yᵢ − ŷᵢ| ÷ Σ |yᵢ|        (indefinida — não exibida — se Σ|yᵢ| = 0)
      viés = (1/n) Σ (ŷᵢ − yᵢ)
      ganho sobre a referência = 1 − MAE_Gestock ÷ MAE_melhor referência

- WAPE em vez de MAPE: o MAPE divide por cada valor real e explode em dias com venda zero.
- Classificação mostrada na tela (convenção da equipe, **não** garantia estatística): WAPE ≤ 25%
  "boa", ≤ 50% "moderada", acima "baixa". Com menos de 28 dias avaliados ou 4 origens, o
  resultado aparece como **preliminar**; sem nenhuma avaliação, "Histórico insuficiente para
  avaliar a precisão".

## 3.7 Recomendação de reposição

    P          = L + R
    demanda_P  = Σ previsão diária nos P dias
    σ*         = max(σ do modelo, RMSE diário medido no backtesting)
    segurança  = z · σ* · √P · k    (z = 1,65; k = fator de correlação, seção 3.3)
    sugestão   = max(0, demanda_P + segurança − saldo atual)
    dias até acabar = soma acumulada da previsão diária (respeita o dia da semana)

- **Revisado nesta versão:** antes a margem usava √L, embora a demanda cobrisse L + R — isso
  subestimava a margem na revisão periódica. Agora usa o período de proteção completo, √(L+R).
- **Hipóteses:** erros aproximadamente normais; a dependência entre dias é tratada pelo fator k.
  z = 1,65 corresponderia a ~95% de nível de serviço **se** as hipóteses valessem. Com demanda intermitente (muitos dias com
  zero) a aproximação normal é fraca — a tela avisa "demanda irregular". O texto da
  recomendação diz explicitamente que a margem **reduz, mas não elimina** o risco de faltar.
- Unidades: tudo na unidade base do ingrediente (g, ml, un).

## 3.8 Explicação mostrada ao usuário

O texto "Como esta previsão é calculada" é gerado a partir dos números que o modelo usou
(janela, fatores por dia da semana, dias atípicos limitados, faixa). Ele **não cita** fatores
que o modelo não usa (preço, clima, feriados, promoções) — e diz isso explicitamente.

## 3.9 Limitações conhecidas

- Sem sazonalidade anual, feriados, clima ou promoções.
- Sem tendência explícita no modelo Gestock (a média ponderada segue mudanças com atraso; o
  Holt-Winters, com tendência, está na comparação).
- Demanda intermitente: não há método específico (ex.: Croston); a tela avisa.
- Produto vendido por peso: previsto em número de vendas, não em kg (o consumo em gramas vem
  dos ingredientes).
- Falta de estoque é detectada só para ingredientes; produtos não têm saldo próprio.
- A faixa do total, mesmo com o fator k, ainda cobriu menos que o nominal nos dados simulados
  (54–67%): as primeiras simulações não têm erros anteriores para calibrar e há poucas somas
  avaliadas (9 a 13). Com mais histórico a calibração melhora.
