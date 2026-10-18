-- ─────────────────────────────────────────────────────────────────────────────
-- 0035_private_conversations — conversaciones PRIVADAS por par (ADR 0024).
--
-- Reemplaza la conversación por paciente con todo el equipo (0033, ADR 0022): la
-- admin podía leer el chat clínico. Ahora:
--   - patient_professional: una por (paciente, profesional). Sólo esos dos.
--   - professional_admin:   una por profesional, con "la administración" (cualquier
--                           admin). Los otros profesionales no la ven.
-- Los mensajes siguen APPEND-ONLY (GRANT SELECT + INSERT). Los existentes se migran
-- a la conversación (paciente, profesional) que corresponde; los que escribió una
-- admin en el chat de un paciente no se migran (la admin ya no participa ahí).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE conversation_kind AS ENUM ('patient_professional', 'professional_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS conversations (
  id                          uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid               NOT NULL,
  region                      region             NOT NULL,
  kind                        conversation_kind  NOT NULL,
  patient_id                  uuid,
  professional_membership_id  uuid               NOT NULL,
  created_at                  timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT conversations_patient_by_kind
    CHECK ((kind = 'patient_professional') = (patient_id IS NOT NULL)),
  CONSTRAINT conversations_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT conversations_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT conversations_professional_membership_id_fk
    FOREIGN KEY (professional_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_patient_professional_uq
  ON conversations (patient_id, professional_membership_id) WHERE kind = 'patient_professional';
CREATE UNIQUE INDEX IF NOT EXISTS conversations_professional_admin_uq
  ON conversations (professional_membership_id) WHERE kind = 'professional_admin';
CREATE INDEX IF NOT EXISTS conversations_tenant_idx ON conversations (tenant_id);

CREATE TABLE IF NOT EXISTS messages (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid         NOT NULL,
  region                region       NOT NULL,
  conversation_id       uuid         NOT NULL,
  author_membership_id  uuid         NOT NULL,
  body                  text         NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at            timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT messages_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT messages_conversation_id_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT messages_author_membership_id_fk
    FOREIGN KEY (author_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_tenant_idx ON messages (tenant_id);

CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id  uuid         NOT NULL,
  membership_id    uuid         NOT NULL,
  tenant_id        uuid         NOT NULL,
  region           region       NOT NULL,
  last_read_at     timestamptz  NOT NULL,
  PRIMARY KEY (conversation_id, membership_id),
  CONSTRAINT conversation_reads_conversation_id_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT conversation_reads_membership_id_fk
    FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE CASCADE,
  CONSTRAINT conversation_reads_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS conversation_reads_tenant_idx ON conversation_reads (tenant_id);

-- ── Migración de lo existente (si 0033 dejó datos) ──────────────────────────
DO $$
BEGIN
  IF to_regclass('public.patient_messages') IS NULL THEN RETURN; END IF;

  -- Profesional de cada mensaje: el autor si es profesional; si lo escribió el
  -- paciente, su asignación activa más antigua. Los de admins quedan afuera.
  CREATE TEMP TABLE _msg_prof ON COMMIT DROP AS
  SELECT pm.id, pm.tenant_id, pm.region, pm.patient_id, pm.author_membership_id, pm.body, pm.created_at,
         CASE WHEN am.role = 'professional' THEN am.id
              ELSE (SELECT ca.membership_id FROM care_assignments ca
                    WHERE ca.patient_id = pm.patient_id AND ca.status = 'active'
                    ORDER BY ca.assigned_at LIMIT 1) END AS prof_id
  FROM patient_messages pm
  JOIN memberships am ON am.id = pm.author_membership_id
  WHERE am.role <> 'admin';

  INSERT INTO conversations (tenant_id, region, kind, patient_id, professional_membership_id)
  SELECT DISTINCT tenant_id, region, 'patient_professional'::conversation_kind, patient_id, prof_id
  FROM _msg_prof WHERE prof_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO messages (id, tenant_id, region, conversation_id, author_membership_id, body, created_at)
  SELECT m.id, m.tenant_id, m.region, c.id, m.author_membership_id, m.body, m.created_at
  FROM _msg_prof m
  JOIN conversations c ON c.kind = 'patient_professional'
                      AND c.patient_id = m.patient_id AND c.professional_membership_id = m.prof_id
  ON CONFLICT (id) DO NOTHING;

  -- Hasta dónde leyó cada participante, ahora por conversación.
  INSERT INTO conversation_reads (conversation_id, membership_id, tenant_id, region, last_read_at)
  SELECT c.id, r.membership_id, r.tenant_id, r.region, r.last_read_at
  FROM message_reads r
  JOIN memberships rm ON rm.id = r.membership_id
  JOIN conversations c ON c.kind = 'patient_professional' AND c.patient_id = r.patient_id
                      AND (rm.role = 'patient' OR c.professional_membership_id = r.membership_id)
  ON CONFLICT DO NOTHING;
END
$$;

DROP TABLE IF EXISTS message_reads;
DROP TABLE IF EXISTS patient_messages;

-- ── GRANTs + RLS ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT         ON conversations      TO nutreitor_app;
GRANT SELECT, INSERT         ON messages           TO nutreitor_app;
GRANT SELECT, INSERT, UPDATE ON conversation_reads TO nutreitor_app;
GRANT SELECT ON conversations, messages, conversation_reads TO nutreitor_worker;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversations
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messages
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE conversation_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_reads FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversation_reads
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
