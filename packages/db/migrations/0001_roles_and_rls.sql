-- ─────────────────────────────────────────────────────────────────────────────
-- 0001_roles_and_rls — rol de runtime, GRANTs y Row Level Security.
--
-- Corre con el rol owner (nutreitor_owner), que es dueño de las tablas y
-- (en dev) superusuario → puede crear roles y administrar policies.
--
-- Separación de roles (núcleo del aislamiento POOL):
--   - nutreitor_owner: dueño del schema, corre migraciones/seed. Bypassa RLS.
--   - nutreitor_app:   runtime de la API. NO owner, sin BYPASSRLS, sin superuser.
--                      Sobre él aplica FORCE ROW LEVEL SECURITY.
--
-- El rol app se aprovisiona idealmente por IaC (mirror local: docker init script).
-- El bloque DO de abajo es un net de seguridad idempotente para entornos donde
-- aún no exista (p. ej. un Postgres pelado fuera de docker).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nutreitor_app') THEN
    -- Password sólo para desarrollo local. En prod la credencial la maneja IaC/Secrets.
    CREATE ROLE nutreitor_app LOGIN PASSWORD 'app_dev_pwd';
  END IF;
END
$$;

-- Acceso base del rol app.
GRANT CONNECT ON DATABASE nutreitor TO nutreitor_app;
GRANT USAGE ON SCHEMA public TO nutreitor_app;

-- Privilegios DML sobre las tablas de negocio. El rol app NUNCA hace DDL.
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO nutreitor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON patients       TO nutreitor_app;

-- ── Row Level Security ───────────────────────────────────────────────────────
-- ENABLE activa RLS; FORCE hace que aplique TAMBIÉN al owner de la tabla (defensa
-- en profundidad: ni el owner lee cross-tenant si por error usa esta conexión).
-- Los superusuarios siguen bypasseando RLS (de ahí que el runtime use nutreitor_app).

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE  ROW LEVEL SECURITY;

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE  ROW LEVEL SECURITY;

-- Helper de lectura del tenant del contexto, robusto al pooling de conexiones:
--   - current_setting(..., true): si el GUC nunca se definió → NULL.
--   - NULLIF(..., ''): una vez que una conexión definió el GUC (aunque sea con
--     SET LOCAL), al volver al pool current_setting devuelve '' (string vacío),
--     no NULL. Sin NULLIF, ''::uuid lanzaría "invalid input syntax for type uuid".
--   En ambos casos el resultado es NULL → la comparación da NULL → se DENIEGA
--   todo (fail-closed): sin contexto de tenant, no se ve ni se escribe nada.

-- Policy de organizations: una org sólo se ve a sí misma en runtime.
-- (El alta de organizaciones es operación de administración: corre con owner,
--  que bypassa RLS.)
CREATE POLICY tenant_isolation ON organizations
  USING      (id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Policy de patients: aislamiento por tenant_id.
--   - WITH CHECK impide INSERT/UPDATE con tenant_id ajeno (no se puede "plantar"
--     una fila en otro tenant aunque se fuerce el valor desde la app).
CREATE POLICY tenant_isolation ON patients
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
