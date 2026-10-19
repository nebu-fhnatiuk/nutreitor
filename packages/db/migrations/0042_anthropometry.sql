-- ─────────────────────────────────────────────────────────────────────────────
-- 0042_anthropometry — sesiones de antropometría ISAK (ADR 0030).
--
-- Se guardan las TOMAS crudas por sitio (jsonb: clave → 1 a 3 valores). Los
-- resultados (Σ pliegues, % graso, somatotipo, Kerr) se calculan al leer, para que
-- una corrección de fórmula alcance a todas las sesiones. Editable y borrable, como
-- las mediciones (corregir un error de carga).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS anthropometry_sessions (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL,
  region                    region      NOT NULL,
  patient_id                uuid        NOT NULL,
  measured_by_membership_id uuid        NOT NULL,
  measured_at               date        NOT NULL,
  -- Protocolo ISAK perfil restringido (+ bloque opcional para Kerr).
  profile                   text        NOT NULL DEFAULT 'isak_restricted' CHECK (profile IN ('isak_restricted')),
  takes                     jsonb       NOT NULL CHECK (jsonb_typeof(takes) = 'object'),
  note                      text        CHECK (length(note) <= 1000),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anthropometry_sessions_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT anthropometry_sessions_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT anthropometry_sessions_measured_by_fk
    FOREIGN KEY (measured_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS anthropometry_sessions_patient_idx
  ON anthropometry_sessions (patient_id, measured_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON anthropometry_sessions TO nutreitor_app;

ALTER TABLE anthropometry_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE anthropometry_sessions FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON anthropometry_sessions
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
