-- ─────────────────────────────────────────────────────────────────────────────
-- 0045_dietary_recalls — recordatorio de 24 h (ADR 0033).
--
-- Lo que el deportista comió y tomó un día, con las comidas en la misma forma que
-- las del plan (items vinculados a la base de alimentos). Los totales se derivan al
-- leer. Editable y borrable (corregir la carga), con auditoría.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dietary_recalls (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL,
  region                    region      NOT NULL,
  patient_id                uuid        NOT NULL,
  recorded_by_membership_id uuid        NOT NULL,
  recalled_date             date        NOT NULL,
  typical                   boolean     NOT NULL,
  day_label                 text        CHECK (length(day_label) <= 40),
  meals                     jsonb       NOT NULL CHECK (jsonb_typeof(meals) = 'array'),
  note                      text        CHECK (length(note) <= 1000),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dietary_recalls_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT dietary_recalls_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT dietary_recalls_recorded_by_fk
    FOREIGN KEY (recorded_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS dietary_recalls_patient_idx
  ON dietary_recalls (patient_id, recalled_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON dietary_recalls TO nutreitor_app;

ALTER TABLE dietary_recalls ENABLE ROW LEVEL SECURITY;
ALTER TABLE dietary_recalls FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dietary_recalls
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
