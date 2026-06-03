-- ─────────────────────────────────────────────────────────────────────────────
-- 0018_meal_plans — plan alimentario VERSIONADO (documento JSONB comidas→items).
-- Un activo por paciente (unique parcial); revisar = supersede + nueva versión.
-- GRANT sin DELETE: la historia de versiones no se borra. Tenant-scoped (RLS).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE meal_plan_status AS ENUM ('active', 'superseded', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS meal_plans (
  id                    uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid              NOT NULL,
  region                region            NOT NULL,
  patient_id            uuid              NOT NULL,
  author_membership_id  uuid              NOT NULL,
  version               integer           NOT NULL,
  status                meal_plan_status  NOT NULL DEFAULT 'active',
  title                 text              NOT NULL,
  start_date            date,
  body                  jsonb             NOT NULL DEFAULT '{"meals":[]}'::jsonb,
  created_at            timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT meal_plans_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT meal_plans_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT meal_plans_author_membership_id_fk
    FOREIGN KEY (author_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS meal_plans_patient_idx
  ON meal_plans (patient_id, version);
-- Un único plan ACTIVO por paciente.
CREATE UNIQUE INDEX IF NOT EXISTS meal_plans_active_unique
  ON meal_plans (patient_id) WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE ON meal_plans TO nutreitor_app;

ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON meal_plans
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
