-- ─────────────────────────────────────────────────────────────────────────────
-- 0049_data_access_log — registro de LECTURAS de datos de salud (KAN-23, ADR 0042).
--
-- Quién del staff vio qué dato de qué deportista (ficha, mediciones, plan,
-- informes, mensajes, pizarra del plantel). `audit_log` registra cambios; esta
-- tabla registra accesos, con otro volumen y otra retención (KAN-24).
--
-- Append-only a nivel ROL: nutreitor_app sólo INSERT + SELECT. Una fila por
-- persona, recurso, deportista y objeto cada 15 minutos (`window_start`): el
-- índice único con NULLS NOT DISTINCT + ON CONFLICT DO NOTHING evita que el
-- polling del chat llene la tabla. Sin FK a patients: el rastro sobrevive al
-- borrado o anonimización del deportista.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_access_log (
  id            uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid            NOT NULL,
  region        region          NOT NULL,
  actor_user_id uuid,
  actor_role    membership_role NOT NULL,
  resource      text            NOT NULL CHECK (resource IN (
    'patient', 'patient_notes', 'assignments', 'metrics', 'anthropometry', 'plan',
    'recalls', 'food_frequency', 'sweat_tests', 'energy', 'adherence',
    'reports', 'report', 'conversation', 'group_board'
  )),
  patient_id    uuid,
  target_id     uuid,
  window_start  timestamptz     NOT NULL,
  created_at    timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT data_access_log_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE RESTRICT,
  CONSTRAINT data_access_log_actor_user_id_fk
    FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS data_access_log_window_uq
  ON data_access_log (tenant_id, actor_user_id, resource, patient_id, target_id, window_start)
  NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS data_access_log_patient_idx
  ON data_access_log (tenant_id, patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS data_access_log_created_idx
  ON data_access_log (tenant_id, created_at DESC);

-- Append-only: NADA de UPDATE/DELETE para el rol de runtime.
GRANT SELECT, INSERT ON data_access_log TO nutreitor_app;

ALTER TABLE data_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_log FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON data_access_log
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
