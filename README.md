# Gestock

Plataforma web de gestão de estoque e previsão de demanda para pequenos estabelecimentos (projeto de extensão).

Arquitetura **cliente-servidor**: o front-end e o back-end são aplicações separadas, cada uma com as
próprias dependências e configuração, e conversam só por HTTP (API REST em `/api`).

| Pasta / arquivo | Conteúdo |
|---|---|
| [backend/](backend/README.md) | Servidor: Node.js + Express + Prisma + PostgreSQL com Row Level Security |
| [frontend/](frontend/README.md) | Cliente: React + Vite + Tailwind (painel, vendas, estoque, cadastros, previsão) |
| [docker-compose.yml](docker-compose.yml) | Sobe banco, back-end e front-end juntos |
| [PLANEJAMENTO.md](PLANEJAMENTO.md) | Visão, stack, arquitetura, modelo de dados e roadmap |
| [DEPLOY.md](DEPLOY.md) | Como colocar no ar: servidor, HTTPS, backup, capacidade medida |

## Rodando tudo com Docker (recomendado)

Requisito: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp .env.example .env          # troque as duas senhas e o JWT_ACCESS_SECRET
docker compose up --build -d  # primeira vez demora alguns minutos
```

Abra **http://localhost:8080** e crie a conta do seu estabelecimento, ou carregue a açaiteria de
demonstração (comando `seed` abaixo) e entre com `demo@gestock.app` / `gestock123`.

| Serviço | O que é | Endereço no seu computador |
|---|---|---|
| `frontend` | React servido pelo nginx, que repassa `/api` para o back-end | http://localhost:8080 |
| `backend` | API Express (usuário de banco **sem** BYPASSRLS) | http://localhost:3333/api |
| `db` | PostgreSQL 16 (dados no volume `db-data`) | `localhost:5432` |
| `migrate` | roda a cada `up`: aplica as migrations e cria/atualiza o usuário `gestock_app` | — |

Comandos úteis:

```bash
docker compose --profile seed run --rm seed   # açaiteria demo (login demo@gestock.app / gestock123)
docker compose logs -f backend                # acompanhar os logs da API
docker compose up --build -d                  # depois de mudar o código (reconstrói as imagens)
docker compose down                           # para tudo (os dados continuam no volume)
docker compose down -v                        # para tudo e APAGA o banco
```

Se alguma porta já estiver em uso, troque `FRONTEND_PORT`, `API_PORT` ou `DB_PORT` no `.env`.

## Desenvolvendo (recarga automática)

Suba só o banco no Docker e rode back e front na sua máquina:

```bash
docker compose up -d db migrate     # banco + migrations + usuário gestock_app

cd backend && cp .env.example .env  # aponte DATABASE_URL/DIRECT_URL para localhost:5432
npm install && npm run dev          # http://localhost:3333/api

cd frontend && npm install && npm run dev   # http://localhost:5173 (repassa /api para a 3333)
```

## Fluxo Git

- `main`: versão estável (só via PR, revisado e com testes passando)
- `develop`: branch de trabalho da equipe
- Commits no padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/): `feat(sales): ...`, `fix(inventory): ...`
