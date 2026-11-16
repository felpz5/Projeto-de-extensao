# 6. Riscos e limitações

| Risco | Efeito na previsão | Como o Gestock trata | O que a equipe/loja deve fazer |
|---|---|---|---|
| **Pouco histórico** | Previsão instável; sem padrão semanal antes de 28 dias | Não prevê com menos de 7 dias; marca "pouco histórico"; precisão "preliminar" com poucas avaliações | Importar o histórico do caderno; esperar ≥ 8 semanas para conclusões |
| **Vendas atípicas** (evento, feriado) | Puxam a média | Filtro de Hampel limita dias muito fora do normal (sem alterar os dados) | Anotar eventos; não usar a previsão em semanas de feriado sem ajuste humano |
| **Datas faltantes** (dias sem registro) | Viram "dia sem venda" e derrubam a média | Importação avisa os dias sem registro | Confirmar se a loja abriu nesses dias; completar os registros |
| **Produtos novos** | Sem histórico | "Histórico insuficiente" até 7 dias | Usar julgamento do dono nas primeiras semanas |
| **Alterações de preço** | Mudam a demanda; o modelo não usa preço | A explicação diz que o preço não é considerado | Revisar a sugestão depois de mudar preço |
| **Falta de estoque** | Demanda não atendida parece demanda zero | Dias com ingrediente zerado ficam fora do ajuste (não viram zero) | Registrar entradas e contagens em dia |
| **Mudança de comportamento** | O passado deixa de representar o futuro | Média ponderada dá mais peso aos dias recentes; o backtesting mostra se o erro cresce | Acompanhar a precisão mensalmente |
| **Registros incorretos ou duplicados** | Distorcem tudo | Venda nunca é apagada (cancelamento); importação bloqueia conteúdo repetido e avisa linhas idênticas | Conferir o relatório de importação; cancelar lançamentos errados |
| **Consumo estimado** (venda por peso) | Consumo de ingrediente é estimativa | Marcado como "Estimado"; corrigido pelas contagens | Contar o estoque periodicamente |
| **Previsão ≠ resultado real** | Sempre haverá erro | Faixa de incerteza, erro medido, aviso "estimativas, não valores exatos" | Tratar como apoio à decisão |
| **Dados simulados confundidos com reais** | Conclusão falsa no relatório acadêmico | Banner "Ambiente de demonstração — dados simulados"; relatório informa a origem | Nunca apresentar a loja demo como resultado do parceiro |
| **Dependências com alertas** | Risco de segurança | Corrigido: 0 vulnerabilidades nas dependências de produção (documento 2) | Rodar `npm audit` a cada atualização |

## Limitações do modelo (resumo do documento 3)

- Não considera preço, clima, feriados, promoções ou sazonalidade anual.
- Não tem componente explícito de tendência (o Holt-Winters, que tem, está na comparação).
- Demanda intermitente não tem método específico.
- A faixa diária é calibrada pelo erro medido; a do total ainda cobre menos que o nominal com
  pouco histórico.
- A margem de segurança supõe erros aproximadamente normais (a dependência entre dias é
  corrigida pelo fator medido).

## Supervisão humana

O Gestock **sugere**; quem decide a compra é o comerciante. A tela mostra o cálculo de cada
sugestão para que ele possa discordar com informação (ex.: "amanhã é feriado, vou comprar mais").
A sugestão reduz, mas **não elimina**, o risco de faltar ou sobrar.
