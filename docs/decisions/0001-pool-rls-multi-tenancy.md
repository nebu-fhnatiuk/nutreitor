# 0001 — Multi-tenancy POOL + RLS (listo para promover a SILO)

- **Estado**: aceptada
- **Fecha**: 2026 (fundación multi-tenant)

## Contexto

Nutreitor es white-label: un mismo deploy sirve a muchas organizaciones con
aislamiento de datos fuerte (hay PHI de por medio). Había que elegir el modelo de
aislamiento desde el commit cero, porque condiciona el esquema y todo el acceso a
datos.

## Opciones consideradas

1. **SILO por tenant** (DB/instancia por organización): aislamiento físico máximo,
   pero costo y complejidad operativa altos desde el día uno (N DBs, N migraciones,
   provisioning por alta).
2. **POOL con aislamiento sólo en el código de la app** (cada query agrega
   `WHERE tenant_id = …`): barato, pero el aislamiento depende de no olvidarse un
   `WHERE` nunca; un bug = fuga cross-tenant.
3. **POOL con Row Level Security de Postgres**: una sola DB, aislamiento forzado por
   la base (no por el código). El runtime corre con un rol sin `BYPASSRLS`.

## Decisión

**POOL + RLS**. Una sola DB con todas las orgs; el aislamiento lo garantiza la
policy `tenant_isolation` (`USING` + `WITH CHECK`) contra el GUC
`app.current_tenant_id`, en modo fail-closed. El schema lleva `tenant_id` + `region`
en toda tabla de negocio desde el principio, de modo que **promover un tenant a
SILO** sea mover filas y reapuntar su conexión, sin tocar lógica de negocio.

## Consecuencias

- **A favor**: costo/operación de un solo cluster; el aislamiento no depende de la
  disciplina del código; defensa en profundidad con `FORCE ROW LEVEL SECURITY` y dos
  roles (owner vs app); fail-closed (sin contexto, no se ve nada).
- **En contra / costos**: toda lectura/escritura tenant-scoped DEBE pasar por
  `withTenant`/`TenantDbService` (si alguien usa la conexión cruda, RLS igual la
  protege pero la query no tendría contexto y fallaría); el control-plane necesita
  una conexión owner separada (`AdminDbService`), que es un perímetro a cuidar.
- **Verificación**: hay un test de aislamiento con 2 tenants (fail-closed, WITH
  CHECK, id ajeno) que corre en CI contra un Postgres real.

Detalle en [`../architecture/multi-tenancy.md`](../architecture/multi-tenancy.md).
