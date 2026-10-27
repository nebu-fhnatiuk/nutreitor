-- ─────────────────────────────────────────────────────────────────────────────
-- 0053_control_role — plano de control sin superusuario (KAN-88, ADR 0048).
--
-- En RDS el usuario maestro (nutreitor_owner) no es superusuario: no ignora RLS y,
-- como las tablas tienen FORCE ROW LEVEL SECURITY, ni siquiera su dueño ve filas
-- de otros tenants. Hasta acá eso funcionaba sólo porque en desarrollo el owner era
-- superusuario. Dos piezas:
--
--   1. nutreitor_control: el rol del plano de control (alta de organizaciones,
--      consola de plataforma, login, invitaciones, sesiones, recuperar contraseña).
--      Sin DDL, sin BYPASSRLS. Ve entre tenants SÓLO las tablas que necesita, por
--      GRANT + una policy explícita `control_plane`. Lo usa la API en lugar del owner.
--
--   2. owner_all: policy explícita para nutreitor_owner en toda tabla con RLS, que
--      reemplaza lo que le daba ser superusuario. El owner queda para migraciones,
--      seed y tests de desarrollo; como dueño de las tablas ya podía desactivar el
--      FORCE, así que la policy no le agrega poder. `ensure_owner_policies()` la crea
--      en las tablas nuevas (el runner la llama después de cada corrida).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nutreitor_control') THEN
    -- Password sólo para desarrollo local. En prod la fija la tarea de migración
    -- desde Secrets Manager (set-role-passwords, ADR 0047).
    CREATE ROLE nutreitor_control LOGIN PASSWORD 'control_dev_pwd';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE nutreitor TO nutreitor_control;
GRANT USAGE ON SCHEMA public TO nutreitor_control;

-- ── Tablas globales (sin RLS) ────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON users           TO nutreitor_control;
GRANT SELECT, INSERT, UPDATE ON org_signups     TO nutreitor_control;
GRANT SELECT, INSERT, UPDATE ON password_resets TO nutreitor_control;
GRANT SELECT, INSERT, UPDATE ON sales_leads     TO nutreitor_control;

-- ── Tablas con RLS: GRANT acotado + policy control_plane ────────────────────
GRANT SELECT, INSERT, UPDATE ON organizations         TO nutreitor_control;
GRANT SELECT, INSERT, UPDATE ON memberships           TO nutreitor_control;
GRANT SELECT, INSERT, UPDATE ON invitations           TO nutreitor_control;
GRANT SELECT, INSERT, UPDATE ON refresh_tokens        TO nutreitor_control;
-- El alta crea el perfil de la profesional; la consola revisa la matrícula.
GRANT SELECT, INSERT, UPDATE ON professional_profiles TO nutreitor_control;
-- Auditoría: sólo agregar (append-only, como para la app).
GRANT INSERT ON audit_log TO nutreitor_control;
-- Pacientes: sólo vincular la ficha con la cuenta al aceptar la invitación. Ningún
-- dato clínico: lectura limitada a las columnas del WHERE.
GRANT SELECT (id, tenant_id, user_id) ON patients TO nutreitor_control;
GRANT UPDATE (user_id)                ON patients TO nutreitor_control;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations', 'memberships', 'invitations', 'refresh_tokens',
    'professional_profiles', 'audit_log', 'patients'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'control_plane') THEN
      EXECUTE format(
        'CREATE POLICY control_plane ON %I AS PERMISSIVE FOR ALL TO nutreitor_control USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END
$$;

-- ── owner_all ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ensure_owner_policies() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'owner_all'
      )
  LOOP
    EXECUTE format(
      'CREATE POLICY owner_all ON %I AS PERMISSIVE FOR ALL TO nutreitor_owner USING (true) WITH CHECK (true)', r.relname);
    n := n + 1;
  END LOOP;
  RETURN n;
END
$$;

REVOKE ALL ON FUNCTION ensure_owner_policies() FROM PUBLIC;

SELECT ensure_owner_policies();
