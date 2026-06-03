-- ─────────────────────────────────────────────────────────────────────────────
-- 0011_professional_profiles — vidriera pública POR MEMBERSHIP. Tenant-scoped (RLS).
-- `visibility` (jsonb) define qué campos son públicos; vacío = todo privado.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS professional_profiles (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL,
  region              region      NOT NULL,
  membership_id       uuid        NOT NULL,
  profile_slug        text        NOT NULL,
  is_publicly_listed  boolean     NOT NULL DEFAULT true,
  display_order       integer     NOT NULL DEFAULT 0,
  specialty           text,
  headline            text,
  bio                 text,
  photo_url           text,
  credentials         text,
  specialties         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  services            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  visibility          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_profiles_membership_id_fk
    FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE CASCADE,
  CONSTRAINT professional_profiles_organization_id_fk
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS professional_profiles_membership_unique
  ON professional_profiles (membership_id);
CREATE UNIQUE INDEX IF NOT EXISTS professional_profiles_org_slug_unique
  ON professional_profiles (organization_id, profile_slug);
CREATE INDEX IF NOT EXISTS professional_profiles_roster_idx
  ON professional_profiles (organization_id, is_publicly_listed, display_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON professional_profiles TO nutreitor_app;

ALTER TABLE professional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_profiles FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON professional_profiles
  USING      (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
