-- ─────────────────────────────────────────────────────────────────────────────
-- 0036_plan_edit_metrics — instrumentación del armado de planes (Fase 4.4).
--
-- Para medir eficiencia: cuánto tardó el profesional en armar cada versión (desde
-- que abrió el editor hasta que guardó; tope 2 h por sesión) y desde qué partió
-- (de cero, versión anterior, plantilla o borrador de NUTRI). Nullable: las
-- versiones anteriores a esta migración no tienen el dato.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE meal_plans
  ADD COLUMN IF NOT EXISTS edit_seconds integer CHECK (edit_seconds BETWEEN 0 AND 7200),
  ADD COLUMN IF NOT EXISTS drafted_from text CHECK (drafted_from IN ('scratch', 'previous', 'template', 'nutri'));
