# Gestock — Projeto de Extensão UniAteneu 2026.2

**Projeto:** Inteligência Artificial Aplicada: Soluções Inteligentes para a Comunidade
**Vertente:** 7 — Previsão de Dados por Séries Temporais
**Docente responsável:** Esp. Bruno Jeronimo Pereira

> Os requisitos usados aqui vêm do texto do projeto repassado à equipe. O **edital original
> não está neste repositório**: confira cada item com o documento oficial, que tem prioridade.

| # | Documento | Conteúdo |
|---|---|---|
| 1 | [Visão geral](01-visao-geral.md) | Problema, público, objetivo, funcionalidades, relação com a vertente 7 |
| 2 | [Arquitetura](02-arquitetura.md) | Tecnologias, fluxo de dados, motor estatístico, segurança, importação |
| 3 | [Metodologia estatística](03-metodologia-estatistica.md) | Série temporal, fórmulas, sazonalidade, atípicos, referências, reposição |
| 4 | [Validação técnica](04-validacao-tecnica.md) | Backtesting, métricas, resultados (simulados × reais), interpretação |
| 5 | [Plano de testes](05-plano-de-testes.md) | Testes automatizados, comandos, resultados executados |
| 6 | [Riscos e limitações](06-riscos-e-limitacoes.md) | O que pode dar errado e como mitigar |
| 7 | [Evidências da extensão](07-evidencias-da-extensao.md) | Checklist para a equipe preencher com evidências reais |
| 8 | [Banner acadêmico](08-banner.md) | Conteúdo do banner + referências verificáveis |
| 9 | [Roteiro de apresentação](09-roteiro-apresentacao.md) | Demonstração passo a passo + perguntas prováveis da banca |
| — | [resultados/](resultados/) | Relatórios de precisão gerados pelo sistema (o nome indica se é SIMULADO ou REAL) |

## Situação em 16/11/2026

- **Técnico:** previsão por séries temporais implementada, com backtesting, métricas (MAE,
  RMSE, WAPE), três modelos de comparação, importação de histórico e telas de precisão.
  Testes automatizados passando (ver documento 5).
- **Resultados:** existem só com **dados simulados** (loja de demonstração). Os resultados
  com dados **reais** da açaiteria parceira ainda **não existem** — dependem da importação do
  histórico dela (documento 4, seção "Como gerar os resultados reais").
- **Acadêmico:** a demonstração ao parceiro, o questionário assinado, as fotos e as demais
  evidências dependem da equipe (documento 7). Nada disso pode ser comprovado pelo código.
