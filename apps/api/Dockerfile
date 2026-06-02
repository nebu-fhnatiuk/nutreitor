# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────────────────────────
# Base: Node 22 + pnpm (corepack). Mismo runtime en dev y prod (paridad).
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ──────────────────────────────────────────────────────────────────────────────
# dev: hot-reload. El código y los node_modules llegan por volúmenes desde
# docker-compose; el `command` real lo define compose (install + build deps +
# migrate + seed + nest --watch).
# ──────────────────────────────────────────────────────────────────────────────
FROM base AS dev
EXPOSE 3001
CMD ["pnpm", "--filter", "@nutreitor/api", "dev"]

# ──────────────────────────────────────────────────────────────────────────────
# build: instala todo el workspace y compila packages + api.
# ──────────────────────────────────────────────────────────────────────────────
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nutreitor/config --filter @nutreitor/shared --filter @nutreitor/db build \
 && pnpm --filter @nutreitor/api build

# ──────────────────────────────────────────────────────────────────────────────
# runtime: imagen de producción (apunta a Fargate). TODO: adelgazar con
# `pnpm deploy`/prune de devDeps; hoy prioriza correctitud sobre tamaño.
# ──────────────────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
