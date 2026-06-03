-- ─────────────────────────────────────────────────────────────────────────────
-- 0019_patient_user_unique — una cuenta (user) se vincula a UNA sola entidad
-- paciente por tenant. El portal resuelve "mi paciente" por user_id; sin esta
-- restricción, una mala invitación podría dejar dos fichas con el mismo user_id y
-- el portal resolvería una arbitraria. Unique parcial (ignora los NULL = sin cuenta).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS patients_tenant_user_unique
  ON patients (tenant_id, user_id) WHERE user_id IS NOT NULL;
