-- ─────────────────────────────────────────────────────────────────────────────
-- 0009_invitations_pending_unique — a lo sumo UNA invitación pendiente por
-- (organization_id, email). Refuerza a nivel DB el supersede que hoy hace sólo el
-- código (que es racy ante creates concurrentes). Índice PARCIAL: sólo aplica a
-- las pending, así las accepted/revoked/expired no chocan.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_unique
  ON invitations (organization_id, email)
  WHERE status = 'pending';
