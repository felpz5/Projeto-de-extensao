# Gestock — back-end (Express + Prisma)
#
# Estágios:
#   deps     dependências completas (inclui o Prisma CLI) + Prisma Client gerado
#   tools    código-fonte + CLI: roda migrations e seed (serviços "migrate" e "seed" do compose)
#   build    compila TypeScript → dist/
#   runtime  imagem final: só dependências de produção, usuário sem privilégios

FROM node:20-slim AS base
WORKDIR /app
# O Prisma precisa do OpenSSL para conectar no Postgres.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
# O postinstall roda `prisma generate` (precisa do schema copiado acima).
RUN npm ci --no-audit --no-fund

FROM deps AS tools
COPY . .
CMD ["npx", "prisma", "migrate", "deploy"]

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
# Client do Prisma gerado no estágio de build (mesma plataforma, mesmo engine).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3333
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3333) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]
