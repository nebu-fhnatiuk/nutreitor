# Nutreitor

Plataforma multi-tenant de captación y seguimiento de pacientes para nutrición.
Pensada desde el primer commit como producto vendible y **white-label**: un mismo
deploy sirve a múltiples organizaciones (nutricionistas, gimnasios, clínicas,
hospitales) con aislamiento de datos fuerte.

## Qué incluye esta versión

1. **Fundación multi-tenant** — monorepo TS, NestJS + Next.js + Postgres/Drizzle,
   modelo **POOL** con **RLS** (Row Level Security), `tenant_id`/`region` en toda
   tabla de negocio, `docker compose up` con hot-reload.
2. **Landing pública de producto** (host raíz, SSR) + estética oscura/verde white-label.
3. **Autenticación self-hosted** (NestJS + Passport, datos en nuestro Postgres):
   identidad global + `memberships`, JWT access en cookie httpOnly + refresh rotado.
4. **Resolución de tenant por subdominio** (`{slug}.nutreitor.com`) con el contexto
   de RLS derivado de la organización + JWT, y **ruteo por rol** (admin/profesional/
   paciente).
5. **Consola del profesional** (`/pro`) que lista/crea pacientes con la sesión real,
   aislados por RLS.

Todavía NO hay agendamiento ni agentes (ver "Fuera de alcance").

---

## Stack

- **Monorepo**: pnpm workspaces + Turborepo. TypeScript end-to-end, ESM.
- **Backend**: NestJS 11 (`apps/api`).
- **Frontend**: Next.js 15 App Router + Tailwind (`apps/web`).
- **Datos**: Postgres 17, ORM Drizzle (`packages/db`).
- **Contenedores**: `docker compose up` levanta todo (db + api + web) con hot-reload.

```
apps/
  api/   NestJS
    core/      tenant (ALS) · auth (passport-jwt, guards, roles) · database (RLS) · config
    modules/   organizations · patients · professionals/scheduling/plans/metrics (placeholders)
    agents/    slot vacío (servicio Python a futuro)
  web/   Next.js (App Router)
    app/page.tsx          landing de producto (host raíz)
    middleware.ts         resuelve subdominio → /s/[slug] + x-tenant-slug
    app/api/[...path]      proxy server-side a la API (cookies first-party)
    app/s/[slug]/          workspace del tenant: login · admin · pro · app
packages/
  db/      schema Drizzle (orgs, patients, users, memberships, refresh_tokens),
           migraciones SQL (RLS), runner, seed, with-tenant
  shared/  tipos/DTOs compartidos (TenantContext, auth, schemas Zod)
  config/  tsconfig/eslint/env compartidos
```

---

## Cómo levantar el entorno

Requisito: un runtime de contenedores con Compose v2. No necesitás Node/pnpm en el
host: todo corre en contenedores con paridad dev/prod.

> **Sin Docker Desktop**: este entorno se levantó con **colima** (Docker headless):
> `brew install colima docker docker-compose` y `colima start --cpu 4 --memory 8`.
> Después, `docker compose ...` funciona normal.

```bash
docker compose up --build
```

El primer arranque tarda (instala dependencias dentro del contenedor, compila los
packages, corre migraciones y seed). Servicios:

| Servicio | URL                          | Notas                                  |
|----------|------------------------------|----------------------------------------|
| web      | http://localhost:3000        | Next.js (landing + workspace por subdominio) |
| api      | http://localhost:3001        | NestJS                                 |
| db       | localhost:5432               | Postgres 17                            |

Healthcheck de la API: `GET http://localhost:3001/health` → `{ "status": "ok", "db": "up" }`.

> `web` arranca recién cuando `api` está *healthy* (evita una carrera de
> instalación sobre el mismo lockfile en el primer boot).
>
> **Hot-reload**: el front (Next) recarga solo. La API (`nest --watch`) **no**
> detecta cambios sobre el bind-mount de colima (inotify/virtiofs): tras editar
> `apps/api`, corré `docker compose restart api`.

### Probar el login y el multi-tenant por subdominio

- **Landing de producto**: http://localhost:3000 (host raíz).
- **Workspace del tenant demo**: http://demo.localhost:3000/login
  (`*.localhost` resuelve a 127.0.0.1 en Chrome/Firefox sin tocar `/etc/hosts`;
  en Safari puede requerir agregarlo).

Usuarios seedeados en la org **demo** (password `demo1234`):

| Email              | Rol           | Destino post-login |
|--------------------|---------------|--------------------|
| `admin@demo.test`  | admin         | `/admin`           |
| `pro@demo.test`    | professional  | `/pro` (pacientes) |
| `patient@demo.test`| patient       | `/app`             |

El tenant se resuelve del subdominio (`demo`) ANTES del login; la sesión (JWT en
cookie httpOnly) lleva `org` y `role`, y el contexto de RLS sale de ahí — nunca de
un parámetro de request. Probar el aislamiento a mano contra la API:

```bash
# Login dentro del tenant (slug en header x-tenant-slug, como hace el proxy de web)
curl -s -X POST localhost:3001/auth/login -H 'Content-Type: application/json' \
  -H 'x-tenant-slug: demo' -d '{"email":"pro@demo.test","password":"demo1234"}' -c j
curl -s localhost:3001/patients -H 'x-tenant-slug: demo' -b j | jq   # sólo pacientes de demo
# Token de demo usado en otro subdominio → 401 (el guard exige slug==org del JWT).
```

### Correr el test de aislamiento

```bash
docker compose exec api pnpm --filter @nutreitor/api test
```

Verifica con 2 tenants seedeados que: cada tenant ve sólo lo suyo, forzar el id de
un paciente ajeno no devuelve nada, insertar con `tenant_id` ajeno es rechazado por
RLS (`WITH CHECK`), y que sin contexto no se ve nada (*fail-closed*).

---

## Racional de las decisiones clave

### Multi-tenancy: POOL + RLS, listo para promover a SILO
Un solo cluster/DB con todas las orgs (modelo **POOL**) por costo y simplicidad
operativa. El aislamiento lo garantiza **Row Level Security** de Postgres, no el
código de la app. El schema lleva `tenant_id` + `region` en toda tabla de negocio
desde el día cero, así promover un tenant a **SILO** (DB/instancia propia) es mover
filas y apuntar su conexión, sin tocar lógica de negocio.

### El `tenant_id` nunca viene del request
Sale del **contexto de auth** (claims del JWT) + el subdominio. El flujo:

1. El **middleware de Next** resuelve el subdominio → `slug` y lo inyecta como
   header `x-tenant-slug` (vía el proxy server-side, que además mantiene las
   cookies first-party en el subdominio del tenant).
2. `TenantContextMiddleware` (API) abre un scope de `AsyncLocalStorage` por request.
3. `JwtAuthGuard` valida el access token, verifica que el `slug` resuelva a la misma
   org del JWT y que el `membership` exista, y deposita el `TenantContext` (+ user/rol)
   en el scope.
4. `TenantDbService` (singleton) abre una transacción e inyecta
   `app.current_tenant_id` con `set_config(..., is_local=true)` (equivale a
   `SET LOCAL`) antes de ejecutar.
5. La policy RLS `tenant_isolation` filtra por ese GUC.

**Por qué AsyncLocalStorage y no request-scoped DI**: el scope `REQUEST` de Nest
re-instancia todo el subárbol de providers en cada request y es viral. ALS da el
mismo aislamiento por request manteniendo los providers como singletons → mejor
throughput, sobre todo bajo Fargate.

**Por qué transacción + `SET LOCAL`**: es transaction-scoped, así la conexión
vuelve al pool sin contexto residual (no hay fuga entre requests) y es compatible
con pgBouncer en *transaction pooling* (clave para escalar en Fargate). `SET` de
sesión no lo sería.

### Defensa en profundidad
- **Dos roles de Postgres**: `nutreitor_owner` (migraciones/seed, bypassa RLS) y
  `nutreitor_app` (runtime, **sin** BYPASSRLS). El runtime jamás usa el owner.
- `FORCE ROW LEVEL SECURITY`: RLS aplica incluso al owner de la tabla.
- `NULLIF(current_setting('app.current_tenant_id', true), '')::uuid` → si no hay
  contexto la policy **deniega todo** (*fail-closed*). El `NULLIF` cubre tanto el
  GUC sin definir (NULL) como el caso de **pooling**: una conexión que ya sirvió un
  `SET LOCAL` vuelve al pool con el GUC en string vacío (`''`), no NULL —sin
  `NULLIF`, `''::uuid` lanzaría error en cada query sin tenant.
- `WITH CHECK`: no se puede insertar/actualizar una fila en otro tenant.
- Integridad referencial (FKs) bypassa RLS por diseño de Postgres, así el alta de
  pacientes valida la FK a su org sin filtrarse información cross-tenant.

### `region` desde el commit cero (enum + denormalizado)
Residencia de datos (GDPR/HIPAA) sin migración de modelo. `region` es un **enum**
(`packages/db/src/schema/_region.ts`) — no text libre — para gobernar el set de
regiones permitidas; agregar una = `ALTER TYPE region ADD VALUE`. Está
**denormalizado** en cada tabla de negocio (organizations/patients/memberships/
refresh_tokens): la región **viaja con el dato**, así el routing/placement no
requiere join y promover a SILO regional es directo (la fila se autodescribe). Se
hereda de la organización al crear y se trata como **inmutable** salvo un job de
migración explícito (un cambio de región ES mover datos), lo que evita drift.

### Borde edge↔API (defensa en profundidad)
El `tenant_id`/`slug` que llega a la API viaja en headers que sólo el edge (proxy de
Next) debería poder setear. Capas:
1. **Lógica**: `JwtAuthGuard` exige `slug(subdominio) == org(JWT)` + membership, así
   spoofear `x-tenant-slug` no escala privilegios.
2. **Secreto compartido** (`x-internal-secret`, `EDGE_SHARED_SECRET`): el proxy/SSR lo
   manda en cada request; un middleware de la API rechaza lo que no lo traiga (salvo
   `/health`). Si la API quedara expuesta, los requests directos se caen.
3. **Red (prod, documentado, NO implementado)**: API en **subnet privada**, alcanzable
   sólo vía el edge/ALB. Es el borde primario; el secreto es la segunda capa. Upgrade
   futuro: HMAC+TTL del contexto firmado / mTLS.

### Autenticación self-hosted + identidad global
Auth propia (NestJS + Passport, datos en nuestro Postgres por residencia/salud):

- **Identidad global**: `users` con `email` único global, **fuera de RLS** (sólo
  credencial + nombre, sin PHI). La pertenencia a una organización vive en
  `memberships(user_id, organization_id, role)` (**bajo RLS**). Un usuario = una
  credencial, N organizaciones; el aislamiento de datos vive en memberships y en
  las tablas de negocio, no en la identidad.
- **Tokens**: access = JWT corto en cookie httpOnly; refresh = token opaco
  (sha256 en `refresh_tokens`, rotación con revocación). Cookies `SameSite=Lax`,
  `Secure` detrás de TLS (off en dev).
- **Subdomain-first**: `{slug}.nutreitor.com` resuelve la org ANTES del login;
  `JwtAuthGuard` exige que el `slug` del subdominio coincida con el `org` del JWT y
  que el membership exista. Un token de un tenant no sirve en el subdominio de otro.
- **Ruteo por rol**: post-login se redirige a `/admin`, `/pro` o `/app`; las páginas
  re-validan el rol contra `/auth/me` (defensa en servidor, no sólo middleware).
- **Reemplazable**: para mover a un IdP (Cognito/Auth0/OIDC) se cambia el verificador
  del token; el contrato (guards, roles, ALS, RLS) no se toca.

### White-label sin recompilar
El tema por organización (color, logo, nombre) se sirve por tenant como CSS
variables que el layout inyecta en runtime (`apps/web/src/lib/tenant-theme.ts`).
`organizations` tiene `slug` (subdominio) y `region`.

### Migraciones
DDL de tablas + SQL crudo de roles/GRANTs/policies RLS conviven como **SQL
versionado y ordenado** en `packages/db/migrations`, aplicado por un runner propio
(`packages/db/src/migrate.ts`) con tabla de control e inmutabilidad por checksum.
`drizzle-kit generate` se usa sólo para **autorar** el diff de DDL.

### CI (GitHub Actions)
`.github/workflows/ci.yml` corre en cada push/PR, 3 jobs:
- **quality**: `install --frozen-lockfile` → `build` → `typecheck` → `lint`.
- **test**: levanta un **Postgres real** (service container) y corre el test de
  aislamiento RLS + el de timing del login; rompe el build si el aislamiento se
  quiebra. No mockea la DB.
- **docker**: buildea las imágenes `runtime` de api y web (valida los multi-stage +
  frozen lockfile).

Config por entorno: el **contrato** de variables es único (validado con zod al boot
en api y web); cambia el **inyector** — dev usa `.env`/compose; staging/prod inyectan
desde **AWS Secrets Manager / SSM Parameter Store** al task de Fargate (ver notas de
producción). Nunca se commitean secrets reales.

---

## Fuera de alcance (con el lugar reservado)

- **Agentes (CHEF/NUTRI/PSICO)**: `apps/api/src/agents/` es un slot vacío. Vivirán
  en un servicio Python separado que consume el mismo Postgres y las mismas RLS
  policies. Ver `apps/api/src/agents/README.md`.
- **Agendamiento (etapa 2)**: módulo placeholder. Antes de implementar se decidirá
  **Cal.com self-hosted vs motor propio** (trade-offs en
  `apps/api/src/modules/scheduling/scheduling.module.ts`). Invariante ya fijado:
  UTC en storage, conversión en presentación, DST por país.

---

## Notas para producción (deuda consciente de esta iteración)

- Migraciones: en prod son un **job/tarea separada**, no el runtime de la API
  (acá `api` migra al arrancar por conveniencia de dev).
- El control-plane (`/admin/organizations`) hoy **no tiene authz**: requiere un
  guard de PLATFORM-ADMIN antes de exponerse. No desplegar así.
- **Auth**: bcryptjs → **argon2id** en prod; cookies `Secure=true` (TLS);
  `ROOT_DOMAIN` real + DNS/cert wildcard para subdominios; rate-limiting de login.
  `users` es global sin RLS (sólo credencial): el acceso queda gateado por membership.
- **Borde de red**: en prod la API va en **subnet privada**, alcanzable sólo vía el
  edge/ALB; el `EDGE_SHARED_SECRET` es defensa en profundidad, no el borde primario.
- **Secrets/config**: staging/prod NO usan `.env`; las variables (DB URLs, JWT/edge
  secrets) se inyectan desde **AWS Secrets Manager / SSM Parameter Store** al task de
  Fargate (p. ej. `secrets` del task definition). Rotación de secretos vía esos
  servicios. Local sigue con `.env` vía compose.
- Las imágenes de runtime de los Dockerfile priorizan correctitud sobre tamaño:
  adelgazar con `pnpm deploy`/prune de devDeps.
- Credenciales en `docker-compose.yml`/`.env.example` son **sólo de desarrollo**.
  En prod los roles y secrets los maneja IaC/Secrets Manager.

---

## Comandos útiles (dentro del contenedor o con Node/pnpm local)

```bash
pnpm dev            # turbo: levanta todo en watch (packages + apps)
pnpm build          # compila todo
pnpm test           # corre tests (turbo, compila deps primero)
pnpm db:migrate     # aplica migraciones (rol owner)
pnpm db:seed        # seed: orgs de ejemplo + org demo con 3 usuarios (admin/pro/patient)
pnpm db:generate    # drizzle-kit: autorar diff de DDL
```

> Para recargar la API tras editar su código bajo colima:
> `docker compose restart api`. Para correr el test de aislamiento:
> `docker compose exec api pnpm --filter @nutreitor/api test`.
