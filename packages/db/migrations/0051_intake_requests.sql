-- ─────────────────────────────────────────────────────────────────────────────
-- 0051_intake_requests — formularios previos a la consulta (KAN-60, ADR 0045).
--
-- El profesional pide la anamnesis o la frecuencia de consumo; el deportista la
-- completa desde el portal; el profesional la revisa y elige qué pasa a la ficha.
-- Lo que pasa queda marcado como autorreportado (`patients.field_sources`).
-- Las respuestas quedan en el pedido aunque no se apliquen (historia).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intake_requests (
  id                         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid         NOT NULL,
  region                     region       NOT NULL,
  patient_id                 uuid         NOT NULL,
  kind                       text         NOT NULL CHECK (kind IN ('anamnesis', 'food_frequency')),
  status                     text         NOT NULL DEFAULT 'requested'
                                          CHECK (status IN ('requested', 'submitted', 'reviewed', 'cancelled')),
  requested_by_membership_id uuid         NOT NULL,
  message                    text         CHECK (length(message) <= 500),
  answers                    jsonb,
  submitted_at               timestamptz,
  reviewed_by_membership_id  uuid,
  reviewed_at                timestamptz,
  -- Qué campos pasaron a la ficha al revisar (anamnesis) o la encuesta creada (FFQ).
  applied                    jsonb,
  created_at                 timestamptz  NOT NULL DEFAULT now(),
  updated_at                 timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT intake_requests_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT intake_requests_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT intake_requests_requested_by_fk
    FOREIGN KEY (requested_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
  CONSTRAINT intake_requests_reviewed_by_fk
    FOREIGN KEY (reviewed_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);
-- Un pedido abierto (pedido o enviado) por deportista y tipo.
CREATE UNIQUE INDEX IF NOT EXISTS intake_requests_open_uq
  ON intake_requests (patient_id, kind) WHERE status IN ('requested', 'submitted');
CREATE INDEX IF NOT EXISTS intake_requests_patient_idx ON intake_requests (patient_id, created_at DESC);

-- Sin DELETE: un pedido se cancela, no se borra.
GRANT SELECT, INSERT, UPDATE ON intake_requests TO nutreitor_app;
-- Worker: avisa al deportista que tiene un formulario para completar.
GRANT SELECT ON intake_requests TO nutreitor_worker;

ALTER TABLE intake_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_requests FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON intake_requests
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Perfil deportivo (deporte, posición, entrenamiento, competencia, lesiones,
-- suplementos, sueño, comidas por día) y de dónde vino cada dato de la ficha.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sport_profile jsonb;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS field_sources jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Origen de la encuesta de frecuencia: cargada por el profesional o autorreportada.
ALTER TABLE food_frequency_surveys
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'professional'
  CHECK (source IN ('professional', 'self_reported'));

ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'intake_requested';
