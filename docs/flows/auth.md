# Flujo: autenticación

Auth self-hosted (NestJS + Passport, datos en nuestro Postgres). Identidad
**global** (`users`) + pertenencia por organización (`memberships`). Es
**subdomain-first**: el tenant se resuelve del subdominio ANTES del login, y la
sesión nunca confía en un `tenant_id` del request. Access token JWT corto en cookie
httpOnly; refresh opaco rotado con detección de reuso.

Componentes y bordes en [`../architecture/overview.md`](../architecture/overview.md);
mecánica de RLS en [`../architecture/multi-tenancy.md`](../architecture/multi-tenancy.md).

## Login

`POST /auth/login` — `apps/api/src/core/auth/auth.controller.ts` →
`AuthService.login()`. El slug llega en `x-tenant-slug` (lo inyecta el middleware de
Next desde el subdominio). El lookup pre-auth de org/usuario usa la conexión
**owner** (`AdminDbService`, bypassa RLS): todavía no hay contexto de tenant.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant E as Edge (Next)
  participant C as auth.controller
  participant S as AuthService
  participant DB as Postgres (owner)

  B->>E: POST /api/auth/login (email, password)
  Note over E: middleware ya resolvió subdominio en x-tenant-slug
  E->>C: POST /auth/login + x-tenant-slug + x-internal-secret
  C->>S: login(slug, email, password, userAgent)
  S->>S: normaliza email a lowercase
  par En paralelo (anti-timing)
    S->>DB: org por slug + usuario por email
    S->>S: bcrypt.compare (DUMMY_HASH si no hay usuario)
  end
  S->>DB: membership activo (revoked_at IS NULL) con role
  Note over S: si falta org, user, membership o password no matchea<br/>devuelve el mismo 401 genérico
  S->>S: issue() firma JWT y emite refresh
  S->>DB: INSERT refresh_tokens (token_hash sha256, expires_at)
  S-->>C: IssuedSession (accessToken, refreshToken, LoginResponse)
  C->>B: Set-Cookie access_token + refresh_token (httpOnly)
  Note over B: redirect por rol: /admin, /pro o /app
```

**Anti-timing (anti-enumeración)**: el membership y el `bcrypt.compare` corren
**siempre**, aun si el usuario no existe (se usa `NIL_UUID` y un `DUMMY_HASH`
precomputado). Todos los caminos de falla devuelven un único error genérico
`Credenciales inválidas`. Cubierto por `apps/api/test/auth-timing.spec.ts`.

**Claims del JWT** (`AccessPayload`): `{ sub: userId, org: orgId, role }`. El access
TTL por defecto es `900s`. Cookies: `httpOnly`, `SameSite=Lax`, `Secure` según
`COOKIE_SECURE` (off en dev), `path=/`, sin `domain` explícito (first-party al
subdominio).

## Resolución de tenant en el borde

- **Middleware de Next** (`apps/web/src/middleware.ts`): extrae `slug` del hostname
  `{slug}.ROOT_DOMAIN`, inyecta el header `x-tenant-slug`, y para rutas protegidas
  (`/admin`, `/pro`, `/app`) redirige a `/login` si no hay cookie `access_token`.
- **Proxy** (`apps/web/src/app/api/[...path]/route.ts`): reenvía a la API agregando
  `x-internal-secret` + `x-tenant-slug` + `cookie` + `user-agent`, y propaga los
  `Set-Cookie` de vuelta al browser (cookies first-party).

El slug **nunca** sale del path o de params; siempre del hostname, validado luego
contra los claims del JWT.

## Validación por request: `JwtAuthGuard`

`apps/api/src/core/auth/guards/jwt-auth.guard.ts`. Orden de chequeos:

1. Passport-JWT valida firma + expiración del `access_token` (extraído de la cookie).
2. Exige `x-tenant-slug`; resuelve la org por slug y exige `org.id == payload.org`
   (un token de un tenant no sirve en el subdominio de otro).
3. Re-verifica el `membership` (pudo revocarse después de emitir el token) y que el
   `role` no haya cambiado.
4. Deposita `TenantContext` + `user` + `org` en el holder de AsyncLocalStorage.

`RolesGuard` (`@Roles(...)`) y `CapabilityGuard` (`@RequireCapability(...)`) corren
después, sobre ese contexto ya poblado.

## Rotación de refresh con detección de reuso

`POST /auth/refresh`. El refresh es un token opaco de 256 bits (hex), guardado sólo
como `sha256` en `refresh_tokens`. Cada uso **rota**: revoca el actual y emite un
sucesor, encadenado por `replaced_by`. Esto permite distinguir un retry benigno
(respuesta perdida) de un robo real.

```mermaid
flowchart TD
  A["POST /auth/refresh<br/>(refresh_token en cookie)"] --> B["hashToken(raw) y buscar por token_hash"]
  B --> C{"existe?"}
  C -->|no| X["401 invalid"]
  C -->|sí| D{"revoked_at seteado?"}
  D -->|no| G{"expirado?"}
  D -->|sí| E{"revocado hace menos de 30s<br/>Y tiene sucesor activo?"}
  E -->|sí: retry benigno| X
  E -->|no: reuso real| F["revokeAllForUser()<br/>mata toda la familia"] --> X
  G -->|sí| X
  G -->|no| H["transacción: re-verifica membership activo"]
  H --> I["issue(predecessorId)<br/>revoca el viejo, encadena replaced_by,<br/>emite nuevo access + refresh"]
  I --> J["Set-Cookie nuevos tokens"]
```

La revocación del predecesor es un **UPDATE condicional** (`WHERE id = predecessor
AND revoked_at IS NULL`): si dos refresh concurrentes corren, sólo uno gana; el otro
ve 0 filas y falla. El re-chequeo del membership dentro de la transacción cierra el
TOCTOU (si se revocó entre el check y el commit, aborta).

**Logout** (`POST /auth/logout`): hashea el refresh y lo marca `revoked_at = now()`
(idempotente), y limpia las cookies.

## Ruteo por rol y re-validación

`roleHome`: `admin → /admin`, `professional → /pro`, `patient → /app`. Post-login el
cliente navega ahí; las páginas re-validan contra `GET /auth/me` en el servidor
(defensa en servidor, no sólo middleware). `/auth/me` devuelve `user`, `org`, `role`
y `capabilities` (derivadas del rol).

## Reemplazable por un IdP

Para mover a Cognito/Auth0/OIDC se cambia el verificador del token (la estrategia
JWT); el contrato (guards, roles, ALS, RLS) no se toca. Ver el ADR
[`../decisions/0003-auth-self-hosted-identidad-global.md`](../decisions/0003-auth-self-hosted-identidad-global.md).
