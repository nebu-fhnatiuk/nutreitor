-- ─────────────────────────────────────────────────────────────────────────────
-- 0038_org_onboarding — alta autoservicio de organizaciones con aprobación (ADR 0025).
--
-- `organizations.status`: una org registrada queda `pending_review` hasta que la
-- plataforma la aprueba; mientras tanto puede configurarse pero no es pública ni
-- invita pacientes. `kind`: equipo o profesional independiente (org de una persona).
-- Las orgs existentes quedan `active` / `team`.
--
-- `org_signups`: solicitud de alta pendiente de verificar el email. Plano de
-- control (como `users`): sin tenant, sin RLS y SIN grants al rol app; la opera
-- sólo la conexión owner. El token se guarda hasheado.
--
-- `users.is_platform_admin`: operadores de la plataforma (consola de aprobación).
-- Se marca a mano / por seed; no hay endpoint que lo otorgue.
--
-- Matrícula en `professional_profiles`: se declara y la plataforma la revisa. Un
-- perfil sólo es público con la matrícula `reviewed`. Los perfiles existentes
-- quedan `reviewed` (dataset de desarrollo; no hay datos productivos).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE org_status AS ENUM ('pending_review', 'active', 'rejected', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE org_kind AS ENUM ('team', 'individual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE license_status AS ENUM ('missing', 'declared', 'reviewed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS status org_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS kind org_kind NOT NULL DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

ALTER TABLE professional_profiles
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS license_jurisdiction text,
  ADD COLUMN IF NOT EXISTS license_status license_status NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS license_note text;

-- Perfiles previos a esta migración: se consideran revisados (sólo hay dev data).
UPDATE professional_profiles SET license_status = 'reviewed'
  WHERE license_status = 'missing';

CREATE TABLE IF NOT EXISTS org_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  org_name text NOT NULL,
  slug text NOT NULL,
  region region NOT NULL,
  kind org_kind NOT NULL,
  license_number text,
  license_jurisdiction text,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_signups_email_idx ON org_signups (email, created_at);

-- Plano de control: el rol app no la ve (la API la opera con la conexión owner).
REVOKE ALL ON org_signups FROM nutreitor_app;

-- El worker sólo recorre organizaciones operativas.
CREATE OR REPLACE FUNCTION worker_tenant_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM organizations WHERE status IN ('active', 'pending_review') ORDER BY id $$;

-- Defensa en profundidad (como el append-only): el rol app NO puede escribir el
-- estado de la org ni el de la matrícula. Sólo la plataforma (conexión owner) los
-- decide. Se pasa de UPDATE de tabla a UPDATE por columna.
REVOKE INSERT, UPDATE, DELETE ON organizations FROM nutreitor_app;
GRANT UPDATE (display_name, brand_logo_url, brand_primary_color, brand_secondary_color,
              public_headline, public_description)
  ON organizations TO nutreitor_app;

REVOKE UPDATE ON professional_profiles FROM nutreitor_app;
GRANT UPDATE (profile_slug, is_publicly_listed, display_order, specialty, headline, bio,
              photo_url, credentials, specialties, services, visibility,
              license_number, license_jurisdiction)
  ON professional_profiles TO nutreitor_app;

-- Invariante en la DB: si cambia la matrícula, la revisión anterior deja de valer
-- (vuelve a `declared`, o `missing` si se borró). El rol app no puede escribir el
-- estado (ver GRANT arriba): lo ajusta este trigger.
CREATE OR REPLACE FUNCTION professional_profiles_license_reset() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.license_number IS DISTINCT FROM OLD.license_number
     OR NEW.license_jurisdiction IS DISTINCT FROM OLD.license_jurisdiction THEN
    NEW.license_status := CASE WHEN NEW.license_number IS NULL THEN 'missing' ELSE 'declared' END;
    NEW.license_note := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS professional_profiles_license_reset ON professional_profiles;
CREATE TRIGGER professional_profiles_license_reset
  BEFORE UPDATE OF license_number, license_jurisdiction ON professional_profiles
  FOR EACH ROW EXECUTE FUNCTION professional_profiles_license_reset();
