-- ─────────────────────────────────────────────────────────────────────────────
-- 0044_energy_requirements — requerimiento energético con periodización (ADR 0032).
--
-- Se guardan las ENTRADAS (fórmula, factor, ajuste, peso/talla/masa libre de grasa
-- usados y los tipos de día con sus sesiones y g/kg); los resultados se calculan al
-- leer. Append-only: cada cambio es una versión nueva y la última es la vigente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS energy_requirements (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL,
  region                region      NOT NULL,
  patient_id            uuid        NOT NULL,
  created_by_membership_id uuid     NOT NULL,
  inputs                jsonb       NOT NULL CHECK (jsonb_typeof(inputs) = 'object'),
  note                  text        CHECK (length(note) <= 1000),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT energy_requirements_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT energy_requirements_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT energy_requirements_created_by_fk
    FOREIGN KEY (created_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS energy_requirements_patient_idx
  ON energy_requirements (patient_id, created_at DESC);

-- Append-only: sin UPDATE ni DELETE para el rol app.
GRANT SELECT, INSERT ON energy_requirements TO nutreitor_app;

ALTER TABLE energy_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_requirements FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON energy_requirements
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
