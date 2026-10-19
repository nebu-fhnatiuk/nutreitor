-- ─────────────────────────────────────────────────────────────────────────────
-- 0041_password_resets — recuperar la contraseña (ADR 0029).
--
-- Plano de control, como `users`: la identidad es GLOBAL (una persona, una
-- contraseña para todas sus orgs). Sin tenant ni RLS y SIN grants al rol app: la
-- opera la conexión owner del flujo de auth. Token de un solo uso, hasheado, con
-- vencimiento corto.
--
-- `users.password_changed_at`: las sesiones emitidas antes del cambio dejan de
-- valer (la de plataforma lo chequea; los refresh tokens se revocan al cambiarla).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_resets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id, created_at);

REVOKE ALL ON password_resets FROM nutreitor_app;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
