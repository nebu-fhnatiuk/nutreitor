-- ─────────────────────────────────────────────────────────────────────────────
-- 0005_refresh_replaced_by — cadena de rotación de refresh tokens.
--
-- `replaced_by` apunta al sucesor emitido al rotar. Permite que la detección de
-- reuso distinga un retry benigno (respuesta perdida → se replayea un token recién
-- revocado cuyo sucesor sigue activo) de un robo real (replay fuera de la ventana
-- de gracia o con la cadena ya avanzada). Self-FK nullable; ON DELETE SET NULL
-- para que una futura limpieza de filas no rompa la integridad.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS replaced_by uuid;

ALTER TABLE refresh_tokens
  DROP CONSTRAINT IF EXISTS refresh_tokens_replaced_by_fk;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_replaced_by_fk
  FOREIGN KEY (replaced_by) REFERENCES refresh_tokens (id) ON DELETE SET NULL;
