-- ─────────────────────────────────────────────────────────────────────────────
-- 0030_plan_templates — plantillas de planes alimentarios del consultorio.
--
-- Un plan armado una vez se guarda como plantilla y se usa como punto de partida
-- con otros pacientes (Fase 4.2). `body` tiene la misma forma que meal_plans.body
-- (layout día/semana, targets, notas; items con su vínculo a alimentos/recetas y
-- la copia de sus valores). Tenant-scoped (RLS). Sin DELETE: se archiva.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_templates (
  id                       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid         NOT NULL,
  region                   region       NOT NULL,
  name                     text         NOT NULL,
  description              text,
  body                     jsonb        NOT NULL,
  created_by_membership_id uuid         NOT NULL,
  archived_at              timestamptz,
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT plan_templates_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT plan_templates_created_by_membership_id_fk
    FOREIGN KEY (created_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS plan_templates_tenant_idx ON plan_templates (tenant_id);

GRANT SELECT, INSERT, UPDATE ON plan_templates TO nutreitor_app;

ALTER TABLE plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_templates FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON plan_templates
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
