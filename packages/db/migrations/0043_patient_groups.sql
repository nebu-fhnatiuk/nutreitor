-- ─────────────────────────────────────────────────────────────────────────────
-- 0043_patient_groups — grupos de deportistas (ADR 0031).
--
-- Un grupo es un plantel, una división o un turno del gimnasio: un conjunto con
-- nombre de pacientes del tenant. Un paciente puede estar en varios (Primera +
-- Sub-20, Turno mañana + Musculación). Borrar un grupo saca a sus miembros del
-- grupo, nunca toca a los pacientes ni sus datos.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patient_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  region      region      NOT NULL,
  name        text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description text        CHECK (length(description) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_groups_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE
);
-- Sin nombres repetidos dentro de la organización (sin distinguir mayúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS patient_groups_tenant_name_uq
  ON patient_groups (tenant_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS patient_group_members (
  tenant_id  uuid        NOT NULL,
  region     region      NOT NULL,
  group_id   uuid        NOT NULL,
  patient_id uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, patient_id),
  CONSTRAINT patient_group_members_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT patient_group_members_group_id_fk
    FOREIGN KEY (group_id) REFERENCES patient_groups (id) ON DELETE CASCADE,
  CONSTRAINT patient_group_members_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS patient_group_members_patient_idx
  ON patient_group_members (patient_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON patient_groups TO nutreitor_app;
GRANT SELECT, INSERT, DELETE ON patient_group_members TO nutreitor_app;

ALTER TABLE patient_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_groups FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patient_groups
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE patient_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_group_members FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patient_group_members
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
