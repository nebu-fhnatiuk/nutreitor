-- ─────────────────────────────────────────────────────────────────────────────
-- 0021_meal_plans_body_layout — estructura multi-estilo del plan alimentario.
--
-- El body pasa de `{ meals, generalNotes }` (día-tipo plano) a un documento
-- discriminado por `layout`:
--   { layout: "day",  day: { meals }, targets?, generalNotes? }
--   { layout: "week", days: { mon: {meals}, ... }, targets?, generalNotes? }
-- El detalle (qty/unit/alternatives/macros por item, targets del plan) es
-- opcional: el estilo lo elige el profesional.
--
-- Esta migración envuelve las filas EXISTENTES (sin `layout`) al layout "day",
-- preservando sus comidas y notas. Es JSONB (sin DDL de columnas) e idempotente:
-- sólo toca filas que aún no tienen `layout`. La normalización en runtime
-- (normalizeMealPlanBody, shared) queda como blindaje defensivo.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE meal_plans
SET body = jsonb_strip_nulls(
  jsonb_build_object(
    'layout', 'day',
    'day', jsonb_build_object('meals', COALESCE(body -> 'meals', '[]'::jsonb)),
    'generalNotes', body -> 'generalNotes'
  )
)
WHERE NOT (body ? 'layout');

-- Default acorde al nuevo shape (un plan vacío es un día sin comidas).
ALTER TABLE meal_plans
  ALTER COLUMN body SET DEFAULT '{"layout":"day","day":{"meals":[]}}'::jsonb;
