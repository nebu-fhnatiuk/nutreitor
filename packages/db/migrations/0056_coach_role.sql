-- ─────────────────────────────────────────────────────────────────────────────
-- 0056_coach_role — cuerpo técnico (KAN-109, ADR 0054).
--
-- Rol `coach` de sólo lectura, asignado a planteles (group_coaches), y el
-- consentimiento del deportista para compartir su composición corporal con él.
-- El valor nuevo del enum no se usa en esta migración (Postgres no lo permite en
-- la misma transacción).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'coach';

CREATE TABLE IF NOT EXISTS group_coaches (
  tenant_id     uuid        NOT NULL,
  region        region      NOT NULL,
  group_id      uuid        NOT NULL,
  membership_id uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, membership_id),
  CONSTRAINT group_coaches_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT group_coaches_group_id_fk
    FOREIGN KEY (group_id) REFERENCES patient_groups (id) ON DELETE CASCADE,
  CONSTRAINT group_coaches_membership_id_fk
    FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS group_coaches_membership_idx ON group_coaches (membership_id);

GRANT SELECT, INSERT, DELETE ON group_coaches TO nutreitor_app;

ALTER TABLE group_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_coaches FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON group_coaches;
CREATE POLICY tenant_isolation ON group_coaches
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Consentimiento para compartir Σ6 y masa muscular con el cuerpo técnico.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS share_body_with_staff boolean NOT NULL DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS share_body_with_staff_at timestamptz;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS share_body_with_staff_by text
  CONSTRAINT patients_share_body_with_staff_by_ck CHECK (share_body_with_staff_by IN ('athlete', 'admin'));
