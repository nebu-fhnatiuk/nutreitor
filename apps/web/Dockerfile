# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────────────────────────
# Base: Node 22 + pnpm (corepack).
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ──────────────────────────────────────────────────────────────────────────────
# dev: next dev con hot-reload. Código y node_modules por volúmenes (compose).
# ──────────────────────────────────────────────────────────────────────────────
FROM base AS dev
EXPOSE 3000
CMD ["pnpm", "--filter", "@nutreitor/web", "dev"]

# ──────────────────────────────────────────────────────────────────────────────
# build: instala el workspace y compila el front (output standalone).
# ──────────────────────────────────────────────────────────────────────────────
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nutreitor/shared build \
 && pnpm --filter @nutreitor/web build

# ──────────────────────────────────────────────────────────────────────────────
# runtime: imagen de prod basada en el output standalone de Next (apunta a Fargate).
# ──────────────────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
