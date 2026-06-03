-- ─────────────────────────────────────────────────────────────────────────────
-- 0013_locations — sede/ubicación ESQUELÉTICA (referencia, sin gestión/UI).
-- Tenant-scoped (RLS). Pacientes y asignaciones pueden referenciarla (nullable).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS locations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  region      region      NOT NULL,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locations_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS locations_tenant_id_idx ON locations (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON locations TO nutreitor_app;

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON locations
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
