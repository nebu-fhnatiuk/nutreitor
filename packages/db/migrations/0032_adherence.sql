-- ─────────────────────────────────────────────────────────────────────────────
-- 0032_adherence — registro de adherencia del paciente (Fase 4.3).
--
-- El paciente marca cada comida del plan (cumplí / en parte / no) y, una vez por
-- día, cómo se sintió (hambre, energía, ánimo 1–5). El profesional asignado lo ve
-- en la evolución. Una fila por (paciente, fecha, comida) y por (paciente, fecha):
-- se corrige con UPDATE (upsert), sin DELETE. Tenant-scoped (RLS).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE adherence_status AS ENUM ('done', 'partial', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS adherence_meal_logs (
  id          uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid              NOT NULL,
  region      region            NOT NULL,
  patient_id  uuid              NOT NULL,
  date        date              NOT NULL,
  meal_name   text              NOT NULL,
  status      adherence_status  NOT NULL,
  note        text,
  -- Versión del plan vigente al registrar (contexto para el profesional).
  plan_id     uuid,
  created_at  timestamptz       NOT NULL DEFAULT now(),
  updated_at  timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT adherence_meal_logs_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT adherence_meal_logs_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT adherence_meal_logs_plan_id_fk
    FOREIGN KEY (plan_id) REFERENCES meal_plans (id) ON DELETE SET NULL,
  CONSTRAINT adherence_meal_logs_unique UNIQUE (patient_id, date, meal_name)
);

CREATE TABLE IF NOT EXISTS adherence_checkins (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid         NOT NULL,
  region      region       NOT NULL,
  patient_id  uuid         NOT NULL,
  date        date         NOT NULL,
  hunger      smallint     CHECK (hunger BETWEEN 1 AND 5),
  energy      smallint     CHECK (energy BETWEEN 1 AND 5),
  mood        smallint     CHECK (mood BETWEEN 1 AND 5),
  note        text,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT adherence_checkins_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT adherence_checkins_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT adherence_checkins_unique UNIQUE (patient_id, date)
);

CREATE INDEX IF NOT EXISTS adherence_meal_logs_tenant_idx ON adherence_meal_logs (tenant_id);
CREATE INDEX IF NOT EXISTS adherence_checkins_tenant_idx ON adherence_checkins (tenant_id);

GRANT SELECT, INSERT, UPDATE ON adherence_meal_logs TO nutreitor_app;
GRANT SELECT, INSERT, UPDATE ON adherence_checkins  TO nutreitor_app;

ALTER TABLE adherence_meal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE adherence_meal_logs FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON adherence_meal_logs
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE adherence_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE adherence_checkins FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON adherence_checkins
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
