# 0048 — Plano de control sin superusuario: rol `nutreitor_control`

- **Estado**: aceptada
- **Fecha**: 2026-10-26
- **Jira**: KAN-88 (Gap 1, KAN-5)

## Contexto

Las tablas de negocio tienen `FORCE ROW LEVEL SECURITY`: la RLS aplica también a su
dueño, `nutreitor_owner`. Hasta ahora el plano de control usaba ese rol para operar
entre tenants:
- alta de organizaciones;
- consola de plataforma;
- resolución del login;
- invitaciones;
- sesiones;
- recuperar la contraseña.

Funcionaba sólo porque en desarrollo y en CI el owner era **superusuario**, y un
superusuario ignora la RLS.

En RDS el usuario maestro no es superusuario. Lo comprobamos levantando un Postgres
17 igual a RDS (`nutreitor_owner` sin superusuario ni `BYPASSRLS`, con `CREATEDB` y
`CREATEROLE`):
- las 52 migraciones corrían bien;
- **36 de 58 archivos de tests se caían** con
  `new row violates row-level security policy for table "organizations"`.

En producción se habrían caído el alta, el login y la consola.

Opciones:

1. **Pedir `BYPASSRLS` para el owner en RDS.** Depende de lo que AWS permita al
   usuario maestro, y además deja a la API con un rol que ve todo.
2. **Una policy explícita para el owner en cada tabla** (`USING (true)`).
   Reproduce lo que hoy da el superusuario, pero la API sigue con un rol que ve
   todos los datos clínicos.
3. **Un rol de plano de control mínimo**, con permisos sólo en las tablas que
   necesita, y la API sin las credenciales del owner.

## Decisión

**Opción 3**, más la policy explícita de la opción 2 para el owner, que queda fuera
de la API.

- **`nutreitor_control`** es el rol del plano de control (`AdminDbService`, variable
  `DATABASE_CONTROL_URL`):
  - sin DDL y sin `BYPASSRLS`;
  - ve entre tenants **sólo** las tablas de plataforma, por `GRANT` más una policy
    `control_plane` (`USING (true)`, `TO nutreitor_control`):
    `organizations`, `memberships`, `invitations`, `refresh_tokens`,
    `professional_profiles`, `audit_log` (sólo `INSERT`) y `patients`;
  - de `patients` sólo lee `id`, `tenant_id` y `user_id`, y sólo actualiza `user_id`,
    para vincular la ficha con la cuenta al aceptar una invitación;
  - de las tablas globales lee y escribe `users`, `org_signups`, `password_resets`
    y `sales_leads`;
  - **no puede leer ningún dato clínico**, y un test lo verifica.
- **La API no tiene las credenciales del owner.** En Terraform recibe el secreto
  `db/control-url` en lugar de `db/owner-url`. La tarea de migración fija también la
  contraseña de `nutreitor_control`.
- **`nutreitor_owner` queda para migraciones**, más el seed y los tests de
  desarrollo:
  - una policy `owner_all` en cada tabla con RLS reemplaza lo que le daba ser
    superusuario. No le agrega poder: como dueño de las tablas ya podía hacer
    `ALTER TABLE … NO FORCE ROW LEVEL SECURITY`;
  - `ensure_owner_policies()` la crea en las tablas nuevas, y el runner de
    migraciones la llama en cada corrida;
  - una migración que tenga que tocar datos de todos los tenants puede hacerlo como
    siempre.
- **Desarrollo y CI son como RDS:**
  - el superusuario del contenedor es `postgres` y sólo administra;
  - `nutreitor_owner` se crea con `docker/postgres/01-roles.sql` sin superusuario ni
    `BYPASSRLS`, con `CREATEDB`, `CREATEROLE` y `pg_signal_backend`, igual que el
    usuario maestro;
  - un test falla si el owner vuelve a ser superusuario.

## Consecuencias

- Una tabla nueva que el plano de control necesite requiere su `GRANT` y su policy
  `control_plane`. El test `db-roles` exige que la lista de tablas con
  `control_plane` sea exactamente la acordada: sumar una es una decisión explícita.
- El plano de control sigue viviendo en el mismo proceso que la API clínica. Sacarlo
  a un servicio propio sigue siendo KAN-16, pero ya no hace falta para proteger los
  datos clínicos de un bug en ese código.
- **Para desarrollo hubo que recrear el volumen de Postgres** (el init sólo corre con
  el volumen vacío). Los pasos para volver a cargar la demo están en el README.
- Las extensiones que usamos (`btree_gist`, `unaccent`, `pg_trgm`) son *trusted*:
  el owner las crea sin superusuario, igual que en RDS.
