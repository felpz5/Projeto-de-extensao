# Gestock

Plataforma web de gestão de estoque e previsão de demanda para pequenos estabelecimentos (projeto de extensão).

| Pasta | Conteúdo |
|---|---|
| [apps/api](apps/api/README.md) | Back-end: NestJS + Prisma + PostgreSQL com Row Level Security |
| apps/web | Front-end (em breve) |
| [docs/PLANEJAMENTO.md](docs/PLANEJAMENTO.md) | Visão, stack, arquitetura, modelo de dados e roadmap |

## Começando

```bash
npm install
cp apps/api/.env.example apps/api/.env   # preencha as URLs do banco e o segredo JWT
npm run prisma:deploy -w @gestock/api
npm run db:seed -w @gestock/api          # opcional: dados de demonstração
npm run dev:api                          # http://localhost:3333/api
```

## Fluxo Git

- `main`: versão estável (só via PR, com CI verde)
- `develop`: branch de trabalho da equipe
- Commits no padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/): `feat(sales): ...`, `fix(inventory): ...`
