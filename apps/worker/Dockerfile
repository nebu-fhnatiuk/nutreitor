# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────────────────────────
# Worker de notificaciones (BullMQ). Mismo runtime que la API (Node 22 + pnpm).
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# dev: el código y node_modules llegan por volúmenes; el `command` lo da compose.
FROM base AS dev
CMD ["pnpm", "--filter", "@nutreitor/worker", "dev"]

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nutreitor/config --filter @nutreitor/shared --filter @nutreitor/db build \
 && pnpm --filter @nutreitor/worker build

# runtime: imagen de producción (Fargate, sin puertos expuestos). TODO: adelgazar
# con `pnpm deploy`, como la API.
FROM base AS runtime
ENV NODE_ENV=production
# CA de RDS para verificar el certificado de la base (sslmode=verify-full, ADR 0047).
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds-global-bundle.pem
COPY --from=build /app /app
WORKDIR /app/apps/worker
CMD ["node", "dist/main.js"]
