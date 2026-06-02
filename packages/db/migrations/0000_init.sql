-- ─────────────────────────────────────────────────────────────────────────────
-- 0000_init — DDL inicial (tablas, índices, FKs).
-- Corre con el rol owner (nutreitor_owner). PG17: gen_random_uuid() es core,
-- no requiere extensión.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL,
  region      text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS organizations_slug_idx ON organizations (slug);

CREATE TABLE IF NOT EXISTS patients (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  region      text        NOT NULL,
  full_name   text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patients_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS patients_tenant_id_idx ON patients (tenant_id);
CREATE INDEX IF NOT EXISTS patients_tenant_created_idx ON patients (tenant_id, created_at);
