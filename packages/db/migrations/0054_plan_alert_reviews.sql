-- ─────────────────────────────────────────────────────────────────────────────
-- 0054_plan_alert_reviews — alertas del plan registradas al guardar (KAN-97, ADR 0051).
--
-- Al guardar una versión del plan, la API recalcula las alertas clínico-nutricionales
-- (motor determinístico de packages/shared) y guarda una fila por alerta, con lo que
-- decidió el profesional: la mantuvo (con motivo; obligatorio en las importantes) o
-- quedó sin revisar. Es la foto de qué avisos tenía el plan cuando se entregó.
-- Append-only: no se edita ni se borra (sin UPDATE ni DELETE en el GRANT).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_alert_reviews (
  id                         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid         NOT NULL,
  region                     region       NOT NULL,
  meal_plan_id               uuid         NOT NULL,
  patient_id                 uuid         NOT NULL,
  -- Versión del requerimiento usada para calcularlas (null si no había).
  energy_requirement_id      uuid,
  rule                       text         NOT NULL CHECK (rule ~ '^[A-D][0-9]{1,2}$'),
  level                      text         NOT NULL CHECK (level IN ('important', 'info')),
  day                        text         NOT NULL
                                          CHECK (day IN ('day', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  day_label                  text         NOT NULL CHECK (length(day_label) <= 80),
  message                    text         NOT NULL CHECK (length(message) <= 500),
  source                     text         NOT NULL CHECK (length(source) <= 200),
  value                      numeric      NOT NULL,
  decision                   text         NOT NULL CHECK (decision IN ('kept', 'unreviewed')),
  reason                     text         CHECK (length(reason) <= 500),
  decided_by_membership_id   uuid         NOT NULL,
  created_at                 timestamptz  NOT NULL DEFAULT now(),
  -- Mantener una alerta importante exige el motivo.
  CONSTRAINT plan_alert_reviews_important_reason_ck
    CHECK (NOT (level = 'important' AND decision = 'kept' AND coalesce(btrim(reason), '') = '')),
  CONSTRAINT plan_alert_reviews_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT plan_alert_reviews_meal_plan_id_fk
    FOREIGN KEY (meal_plan_id) REFERENCES meal_plans (id) ON DELETE CASCADE,
  CONSTRAINT plan_alert_reviews_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT plan_alert_reviews_energy_requirement_id_fk
    FOREIGN KEY (energy_requirement_id) REFERENCES energy_requirements (id) ON DELETE SET NULL,
  CONSTRAINT plan_alert_reviews_decided_by_fk
    FOREIGN KEY (decided_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
  -- Una regla por día por versión del plan.
  CONSTRAINT plan_alert_reviews_plan_rule_day_uq UNIQUE (meal_plan_id, rule, day)
);
CREATE INDEX IF NOT EXISTS plan_alert_reviews_patient_idx ON plan_alert_reviews (patient_id, created_at DESC);

GRANT SELECT, INSERT ON plan_alert_reviews TO nutreitor_app;

ALTER TABLE plan_alert_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_alert_reviews FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON plan_alert_reviews
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
