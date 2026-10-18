-- ─────────────────────────────────────────────────────────────────────────────
-- 0033_patient_messages — chat profesional ↔ paciente (Fase 4.3).
--
-- Una conversación por paciente, entre el paciente y su equipo (profesionales con
-- acceso + admin). Los mensajes son comunicación clínica: APPEND-ONLY (GRANT sólo
-- SELECT + INSERT al rol app, como las notas). `message_reads` guarda hasta dónde
-- leyó cada participante (contadores de no leídos). Tenant-scoped (RLS).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patient_messages (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid         NOT NULL,
  region                region       NOT NULL,
  patient_id            uuid         NOT NULL,
  author_membership_id  uuid         NOT NULL,
  body                  text         NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at            timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT patient_messages_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT patient_messages_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT patient_messages_author_membership_id_fk
    FOREIGN KEY (author_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS patient_messages_patient_idx ON patient_messages (patient_id, created_at);
CREATE INDEX IF NOT EXISTS patient_messages_tenant_idx ON patient_messages (tenant_id);

CREATE TABLE IF NOT EXISTS message_reads (
  tenant_id      uuid         NOT NULL,
  region         region       NOT NULL,
  patient_id     uuid         NOT NULL,
  membership_id  uuid         NOT NULL,
  last_read_at   timestamptz  NOT NULL,
  PRIMARY KEY (patient_id, membership_id),
  CONSTRAINT message_reads_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT message_reads_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT message_reads_membership_id_fk
    FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS message_reads_tenant_idx ON message_reads (tenant_id);

GRANT SELECT, INSERT         ON patient_messages TO nutreitor_app;
GRANT SELECT, INSERT, UPDATE ON message_reads    TO nutreitor_app;

ALTER TABLE patient_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_messages FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patient_messages
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON message_reads
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
