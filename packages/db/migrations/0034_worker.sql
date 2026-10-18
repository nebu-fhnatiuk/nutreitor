-- ─────────────────────────────────────────────────────────────────────────────
-- 0034_worker — worker de notificaciones (Fase 4.3, ADR 0023).
--
-- Rol propio `nutreitor_worker` SIN BYPASSRLS: recorre los consultorios uno por
-- uno fijando el tenant (SET LOCAL), bajo las mismas policies que la API. La lista
-- de consultorios la da una función SECURITY DEFINER que sólo devuelve ids.
--
-- `notifications`: registro de lo enviado (sin contenido) y llave de idempotencia:
-- UNIQUE (tenant, kind, ref_key, destinatario, canal) → un aviso se manda una vez.
-- `notification_preferences`: opt-in del recordatorio diario de adherencia.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nutreitor_worker') THEN
    -- Password sólo dev; en prod lo maneja IaC/Secrets.
    CREATE ROLE nutreitor_worker LOGIN PASSWORD 'worker_dev_pwd';
  END IF;
END
$$;
GRANT USAGE ON SCHEMA public TO nutreitor_worker;

-- Ids de consultorios (sin RLS a propósito, sólo ids). Lo único cross-tenant del worker.
CREATE OR REPLACE FUNCTION worker_tenant_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM organizations ORDER BY id $$;
REVOKE ALL ON FUNCTION worker_tenant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION worker_tenant_ids() TO nutreitor_worker;

DO $$ BEGIN
  CREATE TYPE notification_kind AS ENUM ('appointment_reminder', 'unread_message', 'adherence_reminder');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id                 uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid                 NOT NULL,
  region             region               NOT NULL,
  kind               notification_kind    NOT NULL,
  -- Qué disparó el aviso (turno, ráfaga de mensajes, paciente+fecha): idempotencia.
  ref_key            text                 NOT NULL,
  recipient_user_id  uuid,
  recipient_email    text                 NOT NULL,
  channel            text                 NOT NULL DEFAULT 'email',
  status             notification_status  NOT NULL DEFAULT 'pending',
  attempts           integer              NOT NULL DEFAULT 0,
  error              text,
  created_at         timestamptz          NOT NULL DEFAULT now(),
  sent_at            timestamptz,
  CONSTRAINT notifications_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT notifications_recipient_user_id_fk
    FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT notifications_once UNIQUE (tenant_id, kind, ref_key, recipient_email, channel)
);
CREATE INDEX IF NOT EXISTS notifications_tenant_idx ON notifications (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS notification_preferences (
  tenant_id                  uuid         NOT NULL,
  region                     region       NOT NULL,
  user_id                    uuid         NOT NULL,
  adherence_reminder         boolean      NOT NULL DEFAULT false,
  -- Hora local (0–23) a partir de la cual se recuerda si no registró nada en el día.
  adherence_reminder_hour    smallint     NOT NULL DEFAULT 21 CHECK (adherence_reminder_hour BETWEEN 0 AND 23),
  timezone                   text         NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  updated_at                 timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT notification_preferences_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT notification_preferences_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

GRANT SELECT                 ON notifications            TO nutreitor_app;
GRANT SELECT, INSERT, UPDATE ON notification_preferences TO nutreitor_app;

-- Worker: lee lo justo para decidir y redactar; escribe sólo su registro.
GRANT SELECT ON organizations, patients, users, memberships, care_assignments,
                appointments, availability_rules, patient_messages, message_reads,
                adherence_meal_logs, meal_plans, notification_preferences
  TO nutreitor_worker;
GRANT SELECT, INSERT, UPDATE ON notifications TO nutreitor_worker;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_preferences
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
