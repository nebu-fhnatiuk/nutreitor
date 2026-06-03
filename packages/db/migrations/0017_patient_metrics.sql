-- ─────────────────────────────────────────────────────────────────────────────
-- 0017_patient_metrics — serie temporal de mediciones (evolución del paciente).
-- Wide para métricas comunes (chartable) + extra JSONB para medidas ad-hoc.
-- EDITABLE/BORRABLE (data entry): GRANT con UPDATE y DELETE (a diferencia de las
-- notas append-only). Tenant-scoped (RLS).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patient_metrics (
  id                          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid          NOT NULL,
  region                      region        NOT NULL,
  patient_id                  uuid          NOT NULL,
  recorded_by_membership_id   uuid          NOT NULL,
  measured_at                 date          NOT NULL,
  weight_kg                   numeric(5, 2),
  body_fat_pct                numeric(4, 1),
  muscle_mass_kg              numeric(5, 2),
  waist_cm                    numeric(5, 1),
  hip_cm                      numeric(5, 1),
  extra                       jsonb         NOT NULL DEFAULT '{}'::jsonb,
  note                        text,
  updated_at                  timestamptz   NOT NULL DEFAULT now(),
  created_at                  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT patient_metrics_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT patient_metrics_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT patient_metrics_recorded_by_membership_id_fk
    FOREIGN KEY (recorded_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS patient_metrics_patient_idx
  ON patient_metrics (patient_id, measured_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON patient_metrics TO nutreitor_app;

ALTER TABLE patient_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_metrics FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patient_metrics
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
