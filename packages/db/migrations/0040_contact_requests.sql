-- ─────────────────────────────────────────────────────────────────────────────
-- 0040_contact_requests — solicitud de contacto desde la vidriera (ADR 0027).
--
-- Un visitante (sin cuenta) le escribe a un profesional (`membership_id`) o al
-- consultorio en general (`membership_id` NULL). Sólo lo ve el destinatario: el
-- profesional, o las admins si es para el consultorio. Al aceptarla se crea la ficha
-- (`patient_id`) y se invita al portal. Nunca se vincula a una ficha existente
-- desde la ruta pública (mismo criterio que la reserva pública).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE contact_request_status AS ENUM ('new', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS contact_requests (
  id                       uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid                    NOT NULL,
  region                   region                  NOT NULL,
  -- Destinatario: un profesional, o NULL = el consultorio (lo ven las admins).
  membership_id            uuid,
  full_name                text                    NOT NULL CHECK (length(full_name) BETWEEN 2 AND 120),
  email                    text                    NOT NULL CHECK (email = lower(email)),
  phone                    text                    CHECK (length(phone) <= 40),
  message                  text                    NOT NULL CHECK (length(message) BETWEEN 10 AND 1000),
  -- Consentimiento para tratar los datos con este fin (Ley 25.326).
  consent_at               timestamptz             NOT NULL,
  status                   contact_request_status  NOT NULL DEFAULT 'new',
  patient_id               uuid,
  decided_by_membership_id uuid,
  decided_at               timestamptz,
  -- Nota interna al rechazar (no se le manda al paciente).
  decision_note            text                    CHECK (length(decision_note) <= 1000),
  created_at               timestamptz             NOT NULL DEFAULT now(),
  CONSTRAINT contact_requests_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT contact_requests_membership_id_fk
    FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE SET NULL,
  CONSTRAINT contact_requests_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE SET NULL,
  CONSTRAINT contact_requests_decided_by_fk
    FOREIGN KEY (decided_by_membership_id) REFERENCES memberships (id) ON DELETE SET NULL,
  CONSTRAINT contact_requests_decision_coherent CHECK (
    (status = 'new' AND decided_at IS NULL) OR (status <> 'new' AND decided_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS contact_requests_inbox_idx
  ON contact_requests (tenant_id, status, membership_id, created_at DESC);

-- Sin DELETE: la bandeja guarda la historia (retención: Fase 3).
GRANT SELECT, INSERT, UPDATE ON contact_requests TO nutreitor_app;
GRANT SELECT ON contact_requests TO nutreitor_worker;

ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_requests FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contact_requests
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Aviso al destinatario (worker, ADR 0023): sin el contenido.
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'contact_request';
