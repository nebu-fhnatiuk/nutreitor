-- ─────────────────────────────────────────────────────────────────────────────
-- 0020_patient_clinical_visibility — visibilidad POR CAMPO de la ficha clínica
-- hacia el paciente (portal).
--
-- Hasta acá el portal (`getMe`) exponía los 6 campos clínicos enteros
-- (reason_for_consult, medical_history, allergies, current_medication,
-- diagnosed_conditions, family_history). Este flag jsonb deja EXPLÍCITO qué campos
-- ve el paciente, por ficha, con default CONSERVADOR: `{}` = todo oculto. El
-- profesional/admin habilita campo por campo; el stripping lo hace la API en
-- `getMe` (nunca se confía en el front). Mismo patrón `visibility` jsonb que los
-- perfiles públicos (Sprint 2).
--
-- No toca RLS: `patients` ya está bajo `tenant_isolation` y el rol de runtime ya
-- tiene UPDATE. Es sólo una columna nueva.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS clinical_visibility jsonb NOT NULL DEFAULT '{}'::jsonb;
