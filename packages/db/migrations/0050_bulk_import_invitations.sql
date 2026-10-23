-- ─────────────────────────────────────────────────────────────────────────────
-- 0050_bulk_import_invitations — invitaciones al portal en lote (KAN-43, ADR 0043).
--
-- El import de deportistas crea las invitaciones marcadas con `queued_at`; la API
-- no manda esos mails (con 500 filas el request no termina). El worker las toma,
-- genera el token al momento de enviar (en la base sólo vive el hash) y registra
-- el aviso en `notifications` (UNIQUE → una sola vez por invitación).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE invitations ADD COLUMN IF NOT EXISTS queued_at timestamptz;

-- Las que esperan al worker (pendientes y marcadas): el scan las busca por acá.
CREATE INDEX IF NOT EXISTS invitations_queued_idx
  ON invitations (organization_id, queued_at)
  WHERE status = 'pending' AND queued_at IS NOT NULL;

ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'portal_invitation';

-- Worker: lee las invitaciones y sólo puede rotar el token y su vencimiento.
-- Bajo RLS (policy tenant_isolation por organization_id), como todo lo del worker.
GRANT SELECT ON invitations TO nutreitor_worker;
GRANT UPDATE (token_hash, expires_at) ON invitations TO nutreitor_worker;
