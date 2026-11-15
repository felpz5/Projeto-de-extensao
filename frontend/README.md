# Gestock — Front-end

React 18 + Vite + TypeScript, com Tailwind CSS, componentes no padrão shadcn/ui (Radix),
TanStack Query, React Router, React Hook Form + Zod, Recharts e Sonner (avisos).
Pensado **mobile-first**: o registro de venda e a entrada de mercadoria funcionam no celular.

## Como rodar

```bash
npm install
npm run dev        # http://localhost:5173 — /api é repassado para http://localhost:3333
npm run build      # verifica os tipos e gera dist/
npm test           # testes de unidade (Vitest)
npm run typecheck
```

Para apontar o `npm run dev` para outra API: `VITE_API_PROXY=http://localhost:33333 npm run dev`.

Com Docker (junto com back-end e banco), veja o [README da raiz](../README.md). Para ter dados de
exemplo, rode o seed e entre com `demo@gestock.app` / `gestock123`.

> No Git Bash do Windows, o `npm test` pode falhar com `Cannot read properties of undefined (reading 'config')`
> por causa da letra do drive em minúscula (`c:/`). Rode pelo PowerShell/CMD ou pelo terminal do VS Code.

## Telas

| Rota | Tela | Quem vê |
|---|---|---|
| `/apresentacao` | Página de apresentação com animações disparadas pela rolagem (`features/landing/`). Quem abre `/` sem login cai aqui | público |
| `/entrar`, `/cadastro` | Login e cadastro do estabelecimento (quem cadastra vira dono) | público |
| `/trocar-senha` | Obrigatória no primeiro acesso com senha provisória | logado |
| `/` | Painel: faturamento, pedidos, mais vendidos, sugestões de compra, alertas, últimas movimentações | todos (funcionário vê só o estoque) |
| `/vender` | Registro de venda — balcão (peso/valor) ou online (ingredientes escolhidos) | todos |
| `/vendas` | Histórico com filtros, totais, detalhe da venda (baixas de estoque) e exclusão | dono e gerente |
| `/estoque` | Saldo por ingrediente, entradas, saídas/perdas | todos (funcionário só lança entradas) |
| `/estoque/contagem` | Contagem física → ajustes com a diferença | dono e gerente |
| `/movimentacoes` | Livro-razão com filtros e **estorno** de lançamentos | todos (estorno: dono e gerente) |
| `/ingredientes` | Cadastro (unidade, mínimo, custo, prazo de reposição, porção padrão) | todos (edição: dono e gerente) |
| `/produtos`, `/produtos/:id` | Cadastro; **receita** (por unidade) ou **composição média** (por peso) | todos (edição: dono e gerente) |
| `/previsao` | Reposição de ingredientes e demanda de produtos, com faixa de incerteza e confiança | dono e gerente |
| `/configuracoes` | Estabelecimento, equipe, categorias, minha conta (senha e convites) | todos (abas e edição por papel) |

Esconder um botão não é segurança: a API confere o papel em toda rota. O front só evita mostrar
o que daria 403.

## Estrutura

```
src/
├── main.tsx            providers (TanStack Query, sessão, avisos)
├── index.css           Tailwind + tema (cores em tailwind.config.js, PLANEJAMENTO.md seção 8)
├── app/router.tsx      rotas; cada tela é carregada sob demanda
├── components/
│   ├── ui/             botão, formulário, cartão, selo, diálogo, tabela, estados de carregamento/erro
│   ├── layout/         menu lateral (computador), barra inferior (celular), troca de estabelecimento
│   └── charts.tsx      gráficos (barra por dia, previsão com faixa, ranking) com alternância para tabela
├── features/           uma pasta por domínio: auth, dashboard, sales, inventory, ingredients,
│                       products, forecast, settings
└── lib/
    ├── api.ts          cliente HTTP (token em memória, renovação automática da sessão)
    ├── types.ts        formato das respostas da API
    ├── queries.ts      hooks do TanStack Query e chaves do cache
    ├── format.ts       dinheiro, quantidades (g → kg, ml → L), datas no fuso da loja, rótulos
    ├── schemas.ts      campos numéricos dos formulários (aceitam vírgula) e limites do back
    └── forms.ts        erros 422 da API → mensagem no campo
```

## PWA (app instalável)

O Gestock pode ser instalado no celular e no computador (botão **Instalar app** no menu e na
apresentação; no iPhone: Safari → Compartilhar → Adicionar à Tela de Início). Configuração em
[vite.config.ts](vite.config.ts) (`VitePWA`) e [src/lib/pwa.ts](src/lib/pwa.ts).

- O service worker guarda só a **casca** do app (HTML, JS, CSS, ícones, fonte): abre rápido e
  abre mesmo sem internet. **Respostas da API nunca vão para o cache** (dados da loja).
- Sem internet: faixa amarela de aviso; se o app abrir offline, a pessoa **não é deslogada** —
  aparece "Sem conexão com o servidor" e o app continua sozinho quando a conexão volta.
- Versão nova: aviso "Nova versão disponível" com botão **Atualizar** (não recarrega sozinho para
  não perder uma venda sendo digitada). O app confere se há versão nova a cada hora.
- Atalhos no ícone: Nova venda, Registrar entrada, Estoque.
- Ícones em `public/icons/` (gerados a partir da logo vetorial; `maskable-512.png` tem margem para
  o recorte do Android).
- Só funciona em **HTTPS** ou em `localhost`. Em `npm run dev` o service worker fica desligado;
  para testar: `npm run build && npm run preview`, ou pelo Docker.

## Conversando com a API

- Sempre por caminho relativo (`/api/...`): no `npm run dev` o Vite repassa para o back-end; no
  Docker o nginx faz o mesmo ([nginx.conf](nginx.conf)). Front e API ficam na **mesma origem**, então
  o cookie `httpOnly` do refresh token funciona sem CORS.
- O **access token fica só em memória** (nunca no `localStorage`). Ao abrir o app, a sessão é
  recuperada pelo cookie (`POST /api/auth/refresh`). Resposta `401` → renova uma vez e repete.
- `409 REFRESH_RACE` (duas abas renovando ao mesmo tempo) → espera um pouco e tenta de novo.
  Só `401`/`403` na renovação deslogam; `429`/`5xx` (API reiniciando) não.
- Rota cujo `401` é regra de negócio (ex.: "Senha atual incorreta" na troca de senha) usa
  `api(..., { refreshOn401: false })`, senão o cliente trataria como sessão expirada.
- Campos numéricos aceitam o formato brasileiro: `1.500` = mil e quinhentos, `1,5` = um e meio
  (`parseNum` em lib/schemas.ts). Valores vindos da API vão para o campo com `toInput` (vírgula).
- O nginx manda CSP e outros cabeçalhos de segurança ([security-headers.conf](security-headers.conf)).
  Script de fora (CDN, analytics) precisa ser liberado lá, senão é bloqueado.
- Valores decimais chegam como **texto** (`"24773.53"`): use `toNumber`/`formatMoney`/`formatQty`.
- Datas vão para a API em ISO 8601 com fuso; filtros de dia usam `YYYY-MM-DD` (o dia inteiro no
  fuso do estabelecimento).
- Ao trocar de estabelecimento, todo o cache é apagado (nada de dados de outra loja na tela).
- Tudo que vem de estimativa leva o selo **Estimado** (regra de ouro, PLANEJAMENTO.md 6.3).
