-- ─────────────────────────────────────────────────────────────────────────────
-- 0037_patient_reports — reporte mensual del paciente (Fase 4.4).
--
-- Se arma solo con los datos del mes (peso, adherencia, sensaciones, turnos, plan);
-- el profesional agrega su comentario y lo PUBLICA al portal del paciente. `data` es
-- una foto: en borrador se puede actualizar; publicado queda fijo (lo que leyó el
-- paciente no cambia si después se corrige una medición). Uno por paciente y mes.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE patient_report_status AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS patient_reports (
  id                    uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid                   NOT NULL,
  region                region                 NOT NULL,
  patient_id            uuid                   NOT NULL,
  -- Primer día del mes que cubre.
  period                date                   NOT NULL CHECK (extract(day from period) = 1),
  status                patient_report_status  NOT NULL DEFAULT 'draft',
  data                  jsonb                  NOT NULL,
  comment               text,
  author_membership_id  uuid                   NOT NULL,
  created_at            timestamptz            NOT NULL DEFAULT now(),
  updated_at            timestamptz            NOT NULL DEFAULT now(),
  published_at          timestamptz,
  CONSTRAINT patient_reports_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT patient_reports_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT patient_reports_author_membership_id_fk
    FOREIGN KEY (author_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
  CONSTRAINT patient_reports_one_per_month UNIQUE (patient_id, period)
);
CREATE INDEX IF NOT EXISTS patient_reports_tenant_idx ON patient_reports (tenant_id);

GRANT SELECT, INSERT, UPDATE ON patient_reports TO nutreitor_app;
GRANT SELECT ON patient_reports TO nutreitor_worker;

ALTER TABLE patient_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_reports FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patient_reports
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Aviso al paciente cuando se publica (worker, ADR 0023).
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'report_published';
