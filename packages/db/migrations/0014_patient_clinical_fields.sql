-- ─────────────────────────────────────────────────────────────────────────────
-- 0014_patient_clinical_fields — desarrolla la ficha del paciente: campos
-- SOBRESCRIBIBLES (identificación, clínicos de base, antropométrico BASAL,
-- hábitos) + referencia de sede + baja lógica + updated_at.
-- La serie temporal de métricas NO va acá (sprint futuro): sólo el dato basal.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS document_id          text,
  ADD COLUMN IF NOT EXISTS birth_date           date,
  ADD COLUMN IF NOT EXISTS sex                  text,
  ADD COLUMN IF NOT EXISTS phone                text,
  ADD COLUMN IF NOT EXISTS country              text,
  ADD COLUMN IF NOT EXISTS timezone             text,
  ADD COLUMN IF NOT EXISTS reason_for_consult   text,
  ADD COLUMN IF NOT EXISTS medical_history      text,
  ADD COLUMN IF NOT EXISTS allergies            text,
  ADD COLUMN IF NOT EXISTS current_medication   text,
  ADD COLUMN IF NOT EXISTS diagnosed_conditions text,
  ADD COLUMN IF NOT EXISTS family_history       text,
  ADD COLUMN IF NOT EXISTS height_cm            integer,
  ADD COLUMN IF NOT EXISTS initial_weight_kg    numeric(5, 2),
  ADD COLUMN IF NOT EXISTS activity_level       text,
  ADD COLUMN IF NOT EXISTS goal                 text,
  ADD COLUMN IF NOT EXISTS dietary_preferences  text,
  ADD COLUMN IF NOT EXISTS location_id          uuid,
  ADD COLUMN IF NOT EXISTS archived_at          timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz NOT NULL DEFAULT now();

ALTER TABLE patients
  ADD CONSTRAINT patients_location_id_fk
    FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE SET NULL;
