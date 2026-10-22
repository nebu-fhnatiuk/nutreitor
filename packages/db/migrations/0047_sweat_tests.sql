-- ─────────────────────────────────────────────────────────────────────────────
-- 0047_sweat_tests — prueba de sudoración (ADR 0036).
--
-- Peso antes y después de una sesión, líquido tomado y orina, con duración y
-- condiciones. La tasa de sudoración, el % de pérdida y el plan de líquidos se
-- calculan al leer. `group_id` marca las pruebas cargadas por plantel (se conserva
-- la prueba si se borra el grupo). Editable y borrable, con auditoría.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sweat_tests (
  id                        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid         NOT NULL,
  region                    region       NOT NULL,
  patient_id                uuid         NOT NULL,
  recorded_by_membership_id uuid         NOT NULL,
  group_id                  uuid,
  measured_on               date         NOT NULL,
  session_label             text         CHECK (length(session_label) <= 60),
  duration_min              integer      NOT NULL CHECK (duration_min BETWEEN 10 AND 600),
  temperature_c             numeric(4,1) CHECK (temperature_c BETWEEN -20 AND 55),
  humidity_pct              integer      CHECK (humidity_pct BETWEEN 0 AND 100),
  pre_weight_kg             numeric(5,2) NOT NULL CHECK (pre_weight_kg BETWEEN 20 AND 250),
  post_weight_kg            numeric(5,2) NOT NULL CHECK (post_weight_kg BETWEEN 20 AND 250),
  fluid_intake_ml           integer      NOT NULL CHECK (fluid_intake_ml BETWEEN 0 AND 15000),
  urine_ml                  integer      NOT NULL DEFAULT 0 CHECK (urine_ml BETWEEN 0 AND 5000),
  note                      text         CHECK (length(note) <= 1000),
  created_at                timestamptz  NOT NULL DEFAULT now(),
  updated_at                timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT sweat_tests_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT sweat_tests_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT sweat_tests_recorded_by_fk
    FOREIGN KEY (recorded_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
  CONSTRAINT sweat_tests_group_id_fk
    FOREIGN KEY (group_id) REFERENCES patient_groups (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS sweat_tests_patient_idx ON sweat_tests (patient_id, measured_on DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON sweat_tests TO nutreitor_app;

ALTER TABLE sweat_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sweat_tests FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sweat_tests
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
