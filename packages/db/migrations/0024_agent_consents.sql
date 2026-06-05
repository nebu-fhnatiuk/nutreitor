-- ─────────────────────────────────────────────────────────────────────────────
-- 0024_agent_consents — consentimiento del paciente para los asistentes del portal.
--
-- CHEF y PSICO son del lado del PACIENTE (ver ADR 0015). Antes del primer uso, el
-- paciente da un consentimiento informado explícito (dato sensible, Ley 25.326). Se
-- registra para auditoría; el gateway lo exige antes de habilitar el chat.
--
-- La "crisis" de PSICO NO necesita tabla: se asienta como un `agent_runs.status =
-- 'crisis'` (append-only, ya con INSERT), y el profesional asignado la detecta leyendo
-- esos runs. No se mutan conversaciones.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_consents (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  region      region      NOT NULL,
  patient_id  uuid        NOT NULL,
  -- Versión del texto de consentimiento aceptado (permite re-consentir si cambia).
  version     text        NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_consents_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT agent_consents_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_consents_patient_idx
  ON agent_consents (patient_id, accepted_at);

-- nutreitor_app (gateway Nest): chequea y registra el consentimiento.
GRANT SELECT, INSERT ON agent_consents TO nutreitor_app;

-- RLS: aislamiento por tenant, fail-closed.
ALTER TABLE agent_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_consents FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_consents
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
