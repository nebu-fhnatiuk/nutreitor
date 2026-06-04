# 0006 — Borde edge↔API: defensa en profundidad

- **Estado**: aceptada (capas 1 y 2 implementadas; capa 3 documentada, no implementada)
- **Fecha**: 2026 (fundación)

## Contexto

El `tenant_id`/`slug` que llega a la API viaja en headers (`x-tenant-slug`) que
sólo el edge (proxy de Next) debería poder setear. Si la API quedara alcanzable por
fuera del edge, alguien podría spoofear esos headers. Había que decidir cómo se
protege el borde edge↔API.

## Opciones consideradas

1. **Confiar sólo en la lógica de auth** (el guard valida slug==org+membership):
   necesario, pero no cubre rutas públicas ni el caso de la API expuesta por error.
2. **Sólo borde de red** (subnet privada/ALB): correcto en prod, pero no protege en
   dev ni da defensa en profundidad si la topología de red falla.
3. **Capas combinadas**: lógica + secreto compartido + (a futuro) red.

## Decisión

**Tres capas**, de la primaria a la de respaldo:

1. **Lógica**: `JwtAuthGuard` exige `slug(subdominio) == org(JWT)` + membership, así
   spoofear `x-tenant-slug` no escala privilegios.
2. **Secreto compartido**: `edge-secret.middleware` exige `x-internal-secret`
   (`EDGE_SHARED_SECRET`, comparado en tiempo constante) en todo request salvo
   `/health` — incluidas las rutas públicas (público = sin JWT, no sin secreto).
3. **Red (prod, documentado, NO implementado)**: API en subnet privada, alcanzable
   sólo vía el edge/ALB. Es el borde primario; el secreto es la segunda capa.

## Consecuencias

- **A favor**: si la API queda expuesta, los requests directos sin el secreto se
  caen; las rutas públicas siguen protegidas del acceso directo; capas independientes.
- **En contra / costos**: hay que distribuir/rotar `EDGE_SHARED_SECRET` (en prod vía
  Secrets Manager/SSM); es un secreto simétrico estático — upgrade futuro a HMAC+TTL
  del contexto firmado o mTLS; la capa de red todavía no está implementada (deuda
  consciente para prod).

Detalle en [`../architecture/overview.md`](../architecture/overview.md).
