# Arquitectura — visión general

Nutreitor es una plataforma multi-tenant white-label de captación y seguimiento de
pacientes para nutrición: un mismo deploy sirve a múltiples organizaciones
(nutricionistas, gimnasios, clínicas) con aislamiento de datos fuerte. Este
documento da el mapa de componentes y los **límites de aislamiento** del sistema.
El detalle del aislamiento por tenant está en
[`multi-tenancy.md`](./multi-tenancy.md); el esquema, en
[`data-model.md`](./data-model.md).

## Monorepo

pnpm workspaces + Turborepo, TypeScript end-to-end (ESM), Node ≥ 22.

```
apps/
  api/   NestJS 11 — backend
    core/      tenant (ALS) · auth (passport-jwt, guards, capabilities) ·
               database (RLS app-db / owner admin-db) · security (edge secret) ·
               crypto · mail · config
    modules/   organizations · members · invitations · patients · portal ·
               professionals · public · scheduling (placeholder)
    agents/    slot vacío (servicio Python a futuro)
  web/   Next.js 15 (App Router) + Tailwind — frontend + edge
    app/page.tsx          landing de producto (host raíz)
    middleware.ts         resuelve subdominio → /s/[slug] + x-tenant-slug
    app/api/[...path]      proxy server-side a la API (cookies first-party)
    app/s/[slug]/          workspace del tenant: login · admin · pro · app (portal)
packages/
  db/      schema Drizzle + migraciones SQL (RLS), runner, seed, with-tenant
  shared/  tipos/DTOs compartidos (TenantContext, auth, schemas Zod)
  config/  tsconfig/eslint/env compartidos
```

## Componentes y borde de red

El principio rector es **defensa en profundidad**: el `tenant_id` nunca viaja en el
request del cliente, sale del contexto de auth; y el plano de datos tenant está
detrás de RLS, alcanzable sólo por el rol de runtime sin privilegios.

```mermaid
flowchart TB
  browser["Browser<br/>{slug}.nutreitor.com"]

  subgraph edge["Edge — Next.js (apps/web)"]
    mw["middleware.ts<br/>resuelve subdominio → slug"]
    ssr["SSR / Server Components<br/>+ proxy app/api/[...path]"]
  end

  subgraph apiplane["API — NestJS (apps/api)"]
    edgeguard["edge-secret.middleware<br/>exige x-internal-secret"]
    rl["RateLimitGuard<br/>login y rutas públicas"]
    alsmw["TenantContextMiddleware<br/>abre scope ALS"]
    guard["JwtAuthGuard + CapabilityGuard<br/>valida JWT, slug==org, membership"]
    tdb["TenantDbService (app-db)<br/>SET LOCAL + RLS"]
    adb["AdminDbService (owner-db)<br/>control plane, BYPASS RLS"]
  end

  redis[("Redis 7<br/>contadores de rate-limit")]

  subgraph pg["Postgres 17"]
    direction TB
    tenantTables["Tablas tenant-scoped<br/>(RLS · FORCE)"]
    users["users<br/>(global, sin RLS)"]
  end

  browser -->|"HTTPS + cookie httpOnly"| edge
  mw --> ssr
  ssr -->|"HTTP + x-tenant-slug<br/>+ x-internal-secret + x-client-ip"| edgeguard
  edgeguard -. "rutas sin sesión" .-> rl
  rl -->|"INCR por ventana<br/>(fail-open)"| redis
  edgeguard --> alsmw --> guard --> tdb
  guard -. "alta/listado de orgs<br/>(sin tenant)" .-> adb
  tdb -->|"rol nutreitor_app<br/>(sin BYPASSRLS)"| tenantTables
  adb -->|"rol nutreitor_owner<br/>(BYPASSRLS)"| pg
  guard -.->|"lookup pre-auth de org por slug"| adb

  classDef global fill:#3a2,stroke:#0a0,color:#fff;
  classDef tenant fill:#234,stroke:#08a,color:#fff;
  class users global;
  class tenantTables tenant;
```

**Límites de aislamiento marcados arriba:**

- **Borde de red (edge → API)**: en prod la API vive en subnet privada, alcanzable
  sólo vía el edge/ALB. El `x-internal-secret` (`EDGE_SHARED_SECRET`) es la segunda
  capa: la API rechaza todo request sin él, salvo `/health`.
- **Borde de tenant (RLS)**: el runtime usa el rol `nutreitor_app` (sin `BYPASSRLS`).
  Toda lectura/escritura de tablas de negocio pasa por `TenantDbService`, que setea
  `app.current_tenant_id` por transacción y deja que la policy RLS filtre.
- **Borde de control plane**: el alta/listado de organizaciones (operación de
  plataforma, sin tenant) usa `AdminDbService` con el rol `nutreitor_owner`
  (bypassa RLS) — explícitamente fuera del perímetro de tenant. Hoy **sin authz de
  PLATFORM-ADMIN** (deuda consciente, no desplegar así).
- **Rate-limiting (sin sesión)**: login, invitaciones y la reserva pública cuentan
  hits por IP (y por email en el login) en Redis; 429 al pasarse. Si Redis no
  responde, deja pasar. La IP real la resuelve el edge desde `X-Forwarded-For`. Ver
  [ADR 0017](../decisions/0017-rate-limiting-redis.md).
- **`users` es global**: única tabla fuera de RLS (sólo credencial + nombre, sin
  PHI). El acceso queda gateado por `memberships`, que sí está bajo RLS.

## Despliegue

- **Dev**: `docker compose up` levanta `db` (Postgres 17) + `redis` + `api` + `web`
  (+ `agents`) con hot-reload. La API migra al arrancar (conveniencia de dev).
- **Prod (objetivo)**: Fargate; API en subnet privada detrás del edge/ALB;
  migraciones como job separado; ElastiCache (Redis 7) para el rate-limiting; secrets
  desde AWS Secrets Manager / SSM. Ver las
  "Notas para producción" del [README](../../README.md).

## Evolución a servicios

La API es un **modular monolith** a propósito: la arquitectura objetivo es orientada
a servicios, alcanzada **incrementalmente** (extraer un bounded context cuando hay un
disparador real), no de un big-bang. Los módulos, los DTOs de `shared`, el
`tenant_id`/`region` por tabla y el servicio de agentes ya reservado son las costuras
para esa extracción. Reglas, disparadores y orden en el ADR
[`../decisions/0012-modular-monolith-evolucion-a-servicios.md`](../decisions/0012-modular-monolith-evolucion-a-servicios.md).

## Fuera de alcance (con el lugar reservado)

- **Agentes (CHEF/NUTRI/PSICO)**: `apps/api/src/agents/` es un slot vacío. Vivirán
  en un servicio Python que consume el mismo Postgres bajo las mismas RLS policies.
- **Agendamiento**: módulo placeholder; antes de implementar se decide Cal.com
  self-hosted vs motor propio. Invariante fijado: UTC en storage, conversión en
  presentación, DST por país.
