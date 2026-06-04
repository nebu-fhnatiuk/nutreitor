# 0003 — Auth self-hosted con identidad global y rotación de refresh

- **Estado**: aceptada
- **Fecha**: 2026 (sprint de autenticación)

## Contexto

Hacía falta autenticación multi-tenant subdomain-first. Dos preguntas: dónde vive la
identidad (IdP externo vs propia) y cómo se modela un usuario que puede pertenecer a
varias organizaciones.

## Opciones consideradas

1. **IdP gestionado** (Cognito/Auth0/OIDC) desde el día uno: menos código de auth,
   pero acopla residencia de datos (PHI/salud) a un tercero y agrega dependencia
   externa temprana.
2. **Auth self-hosted** (NestJS + Passport, datos en nuestro Postgres) con identidad
   **por tenant** (un usuario por organización): simple de aislar, pero duplica
   credenciales si una persona está en varias orgs.
3. **Auth self-hosted con identidad GLOBAL**: `users` con email único global (sólo
   credencial + nombre, sin PHI, **fuera de RLS**); la pertenencia vive en
   `memberships(user_id, organization_id, role)` bajo RLS.

## Decisión

**Opción 3**. Una credencial global, N organizaciones; el aislamiento de datos vive
en `memberships` y en las tablas de negocio, no en la identidad. Access token = JWT
corto en cookie httpOnly; refresh = token opaco (sha256 en `refresh_tokens`) con
**rotación** y detección de reuso (cadena `replaced_by` + ventana de gracia).
Subdomain-first: el `JwtAuthGuard` exige que el slug del subdominio coincida con la
`org` del JWT y que el membership exista.

## Consecuencias

- **A favor**: residencia de datos bajo nuestro control; un humano = una credencial
  aunque esté en varias orgs; `users` sin PHI reduce el blast radius de esa tabla
  global; rotación de refresh limita el daño de un token robado.
- **En contra / costos**: mantenemos código sensible (timing del login con
  `DUMMY_HASH`, rotación, manejo de cookies) y su superficie de test; deuda
  consciente para prod (argon2id, `Secure`, rate-limiting).
- **Reemplazable**: para migrar a un IdP se cambia el verificador del token; el
  contrato (guards, roles, ALS, RLS) no se toca.

Detalle en [`../flows/auth.md`](../flows/auth.md).
