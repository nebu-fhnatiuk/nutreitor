-- ─────────────────────────────────────────────────────────────────────────────
-- 0023_agents — datos de los agentes de IA (NUTRI/CHEF/PSICO) + rol del servicio.
--
-- El servicio de agentes es un proceso Python SEPARADO (ver ADR 0013) que consume
-- ESTE Postgres bajo RLS, con un rol propio `nutreitor_agents` (equivalente a
-- nutreitor_app: NO owner, sin BYPASSRLS), inyectando `app.current_tenant_id` por
-- transacción. Lee el contexto clínico del paciente y persiste conversaciones +
-- un audit append-only de cada run.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE agent_kind AS ENUM ('nutri', 'chef', 'psico');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_message_role AS ENUM ('user', 'assistant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Rol del servicio Python. Password sólo dev; en prod lo maneja IaC/Secrets.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nutreitor_agents') THEN
    CREATE ROLE nutreitor_agents LOGIN PASSWORD 'agents_dev_pwd';
  END IF;
END
$$;
GRANT CONNECT ON DATABASE nutreitor TO nutreitor_agents;
GRANT USAGE ON SCHEMA public TO nutreitor_agents;

-- ── agent_conversations ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_conversations (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL,
  region                    region      NOT NULL,
  agent                     agent_kind  NOT NULL,
  -- Sujeto de la conversación (sobre qué paciente). Nullable: una charla puede no
  -- ser sobre un paciente puntual.
  patient_id                uuid,
  created_by_membership_id  uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_conversations_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT agent_conversations_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS agent_conversations_patient_idx
  ON agent_conversations (patient_id, created_at);

-- ── agent_messages ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_messages (
  id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid                NOT NULL,
  region          region              NOT NULL,
  conversation_id uuid                NOT NULL,
  role            agent_message_role  NOT NULL,
  content         text                NOT NULL,
  created_at      timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT agent_messages_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT agent_messages_conversation_id_fk
    FOREIGN KEY (conversation_id) REFERENCES agent_conversations (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_messages_conversation_idx
  ON agent_messages (conversation_id, created_at);

-- ── agent_runs (audit append-only de cada llamada al modelo) ───────────────────
CREATE TABLE IF NOT EXISTS agent_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  region          region      NOT NULL,
  conversation_id uuid,
  agent           agent_kind  NOT NULL,
  model           text        NOT NULL,
  input_tokens    integer,
  output_tokens   integer,
  latency_ms      integer,
  -- ok | error | blocked (guardrail). Texto: no acoplar un enum a algo que evoluciona.
  status          text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_runs_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_runs_tenant_created_idx
  ON agent_runs (tenant_id, created_at);

-- ── GRANTs ────────────────────────────────────────────────────────────────────
-- nutreitor_app (gateway Nest): lectura de historial; alta de conversación.
GRANT SELECT, INSERT ON agent_conversations TO nutreitor_app;
GRANT SELECT          ON agent_messages      TO nutreitor_app;
GRANT SELECT          ON agent_runs          TO nutreitor_app;

-- nutreitor_agents (servicio Python): lee el contexto clínico (sólo lo que necesita)
-- y escribe conversaciones/mensajes + el audit de runs. Sin UPDATE/DELETE: runs y
-- mensajes son append-only.
GRANT SELECT          ON patients          TO nutreitor_agents;
GRANT SELECT          ON meal_plans        TO nutreitor_agents;
GRANT SELECT          ON patient_metrics   TO nutreitor_agents;
GRANT SELECT          ON care_assignments  TO nutreitor_agents;
GRANT SELECT          ON memberships       TO nutreitor_agents;
GRANT SELECT          ON users             TO nutreitor_agents;
GRANT SELECT, INSERT  ON agent_conversations TO nutreitor_agents;
GRANT SELECT, INSERT  ON agent_messages      TO nutreitor_agents;
GRANT SELECT, INSERT  ON agent_runs          TO nutreitor_agents;

-- ── RLS (las tres tablas de agentes; aislamiento por tenant, fail-closed) ──────
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_conversations
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_messages
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_runs
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
