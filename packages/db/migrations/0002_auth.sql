-- ─────────────────────────────────────────────────────────────────────────────
-- 0002_auth — identidad (users global), memberships y refresh tokens.
-- Corre con el rol owner. Mismo patrón de RLS que 0001 para las tablas de tenant.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enum de roles (CREATE TYPE no soporta IF NOT EXISTS → guard idempotente).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_role') THEN
    CREATE TYPE membership_role AS ENUM ('admin', 'professional', 'patient');
  END IF;
END
$$;

-- ── users: identidad de plataforma, email único GLOBAL, SIN RLS ──────────────
-- No lleva tenant_id/region ni PHI. El acceso queda gateado por memberships
-- (toda consulta de login resuelve primero la org + el membership).
CREATE TABLE IF NOT EXISTS users (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text        NOT NULL,
  hashed_password text        NOT NULL,
  full_name       text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON users TO nutreitor_app;

-- ── memberships: pertenencia user↔org con rol. Tenant-scoped por organization_id ─
CREATE TABLE IF NOT EXISTS memberships (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid            NOT NULL,
  organization_id uuid            NOT NULL,
  role            membership_role NOT NULL,
  region          text            NOT NULL,
  created_at      timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT memberships_user_org_unique UNIQUE (user_id, organization_id),
  CONSTRAINT memberships_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT memberships_organization_id_fk
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS memberships_org_idx  ON memberships (organization_id);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO nutreitor_app;

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON memberships
  USING      (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ── refresh_tokens: sesiones persistidas. Tenant-scoped por organization_id ───
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL,
  organization_id uuid        NOT NULL,
  region          text        NOT NULL,
  token_hash      text        NOT NULL,
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refresh_tokens_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT refresh_tokens_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT refresh_tokens_organization_id_fk
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_org_idx  ON refresh_tokens (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO nutreitor_app;

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON refresh_tokens
  USING      (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
