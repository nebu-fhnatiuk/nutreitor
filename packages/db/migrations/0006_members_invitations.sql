-- ─────────────────────────────────────────────────────────────────────────────
-- 0006_members_invitations — paciente-entidad, baja soft de membership,
-- invitaciones y asignaciones profesional↔paciente.
-- ─────────────────────────────────────────────────────────────────────────────

-- patients: entidad clínica con vínculo opcional a cuenta + email de contacto.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email   text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_user_id_fk;
ALTER TABLE patients ADD CONSTRAINT patients_user_id_fk
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS patients_user_id_idx ON patients (user_id);

-- memberships: baja soft reversible.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- ── invitations ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status') THEN
    CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS invitations (
  id                  uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid              NOT NULL,
  region              region            NOT NULL,
  email               text              NOT NULL,
  role                membership_role   NOT NULL,
  token_hash          text              NOT NULL,
  status              invitation_status NOT NULL DEFAULT 'pending',
  expires_at          timestamptz       NOT NULL,
  invited_by_user_id  uuid,
  patient_id          uuid,
  accepted_at         timestamptz,
  created_at          timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT invitations_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT invitations_organization_id_fk
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT invitations_invited_by_user_id_fk
    FOREIGN KEY (invited_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT invitations_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS invitations_org_idx   ON invitations (organization_id);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations (email);

GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO nutreitor_app;

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invitations
  USING      (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ── patient_assignments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_assignments (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL,
  region                region      NOT NULL,
  patient_id            uuid        NOT NULL,
  professional_user_id  uuid        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_assignments_unique UNIQUE (patient_id, professional_user_id),
  CONSTRAINT patient_assignments_organization_id_fk
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT patient_assignments_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT patient_assignments_professional_user_id_fk
    FOREIGN KEY (professional_user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS patient_assignments_org_idx ON patient_assignments (organization_id);
CREATE INDEX IF NOT EXISTS patient_assignments_professional_idx ON patient_assignments (professional_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON patient_assignments TO nutreitor_app;

ALTER TABLE patient_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_assignments FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patient_assignments
  USING      (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
