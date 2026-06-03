-- ─────────────────────────────────────────────────────────────────────────────
-- 0007_audit_log — audit append-only de acciones administrativas.
--
-- Inmutabilidad forzada a nivel ROL: a nutreitor_app se le otorga SÓLO
-- INSERT + SELECT (sin UPDATE/DELETE) → el runtime no puede alterar ni borrar
-- registros de auditoría. Tenant-scoped por RLS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid            NOT NULL,
  region          region          NOT NULL,
  actor_user_id   uuid,
  actor_role      membership_role,
  action          text            NOT NULL,
  target_type     text,
  target_id       uuid,
  metadata        jsonb           NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_organization_id_fk
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT audit_log_actor_user_id_fk
    FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS audit_log_org_created_idx ON audit_log (organization_id, created_at);

-- Append-only: NADA de UPDATE/DELETE para el rol de runtime.
GRANT SELECT, INSERT ON audit_log TO nutreitor_app;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_log
  USING      (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
