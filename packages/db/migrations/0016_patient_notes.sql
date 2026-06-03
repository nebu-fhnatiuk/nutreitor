-- ─────────────────────────────────────────────────────────────────────────────
-- 0016_patient_notes — notas clínicas APPEND-ONLY (autor=membership, timestamp,
-- contenido). Inmutabilidad forzada por el GRANT: sólo SELECT+INSERT al rol app
-- (sin UPDATE/DELETE), igual que audit_log. Corregir = nueva entrada.
-- Tenant-scoped (RLS). Autor con ON DELETE RESTRICT: preserva la autoría.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patient_notes (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  region               region      NOT NULL,
  patient_id           uuid        NOT NULL,
  author_membership_id uuid        NOT NULL,
  content              text        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_notes_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT patient_notes_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT patient_notes_author_membership_id_fk
    FOREIGN KEY (author_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS patient_notes_patient_idx
  ON patient_notes (patient_id, created_at);

-- Append-only: sólo lectura + alta. Sin UPDATE/DELETE → inmutable a nivel DB.
GRANT SELECT, INSERT ON patient_notes TO nutreitor_app;

ALTER TABLE patient_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_notes FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patient_notes
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
