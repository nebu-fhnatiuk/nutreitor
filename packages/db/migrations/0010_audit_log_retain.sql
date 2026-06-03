-- ─────────────────────────────────────────────────────────────────────────────
-- 0010_audit_log_retain — el audit log NO se borra por cascade al eliminar una
-- organización (eso anularía un trail inmutable). Pasa a ON DELETE RESTRICT: dar
-- de baja un tenant exige manejar/archivar su auditoría deliberadamente primero.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_organization_id_fk;

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_organization_id_fk
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE RESTRICT;
