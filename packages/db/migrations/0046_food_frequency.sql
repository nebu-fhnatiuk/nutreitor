-- ─────────────────────────────────────────────────────────────────────────────
-- 0046_food_frequency — cuestionario de frecuencia de consumo (ADR 0034).
--
-- Respuestas por grupo de alimentos (frecuencia + porciones cada vez). Los
-- resultados (porciones por día, comparación con las GAPA) se calculan al leer.
-- Editable y borrable, con auditoría.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS food_frequency_surveys (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL,
  region                    region      NOT NULL,
  patient_id                uuid        NOT NULL,
  recorded_by_membership_id uuid        NOT NULL,
  answered_on               date        NOT NULL,
  answers                   jsonb       NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
  note                      text        CHECK (length(note) <= 1000),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT food_frequency_surveys_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT food_frequency_surveys_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT food_frequency_surveys_recorded_by_fk
    FOREIGN KEY (recorded_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS food_frequency_surveys_patient_idx
  ON food_frequency_surveys (patient_id, answered_on DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON food_frequency_surveys TO nutreitor_app;

ALTER TABLE food_frequency_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_frequency_surveys FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON food_frequency_surveys
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
