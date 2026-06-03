-- ─────────────────────────────────────────────────────────────────────────────
-- 0015_care_assignments — relación paciente↔profesional M:N, VERSIONADA.
-- Reemplaza patient_assignments (0006): aquélla era por user global y SIN versión;
-- estaba muerta (sin uso en código). La nueva referencia el MEMBERSHIP y versiona
-- la vigencia (active/ended) para conservar la historia de quién atendió y cuándo.
-- GRANT sin DELETE: una asignación NUNCA se borra (se cierra).
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS patient_assignments;

DO $$ BEGIN
  CREATE TYPE care_assignment_status AS ENUM ('active', 'ended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS care_assignments (
  id                        uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid                    NOT NULL,
  region                    region                  NOT NULL,
  patient_id                uuid                    NOT NULL,
  membership_id             uuid                    NOT NULL,
  location_id               uuid,
  status                    care_assignment_status  NOT NULL DEFAULT 'active',
  assigned_at               timestamptz             NOT NULL DEFAULT now(),
  ended_at                  timestamptz,
  assigned_by_membership_id uuid,
  created_at                timestamptz             NOT NULL DEFAULT now(),
  CONSTRAINT care_assignments_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT care_assignments_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT care_assignments_membership_id_fk
    FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE CASCADE,
  CONSTRAINT care_assignments_location_id_fk
    FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS care_assignments_patient_idx
  ON care_assignments (patient_id, status);
CREATE INDEX IF NOT EXISTS care_assignments_membership_idx
  ON care_assignments (membership_id, status);
-- Nunca dos asignaciones ACTIVAS para el mismo (paciente, profesional).
CREATE UNIQUE INDEX IF NOT EXISTS care_assignments_active_unique
  ON care_assignments (patient_id, membership_id) WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE ON care_assignments TO nutreitor_app;

ALTER TABLE care_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_assignments FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON care_assignments
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
