-- ─────────────────────────────────────────────────────────────────────────────
-- 0003_users_email_lowercase — invariante de email case-insensitive.
--
-- El login normaliza el email a lowercase para buscar; si el alta guardara un
-- email con mayúsculas, ese usuario nunca podría loguearse y el UNIQUE
-- case-sensitive permitiría duplicados ('a@x.com' y 'A@x.com'). Este CHECK
-- garantiza que TODO email almacenado ya sea lowercase, así el lookup siempre
-- matchea y el UNIQUE(email) existente da unicidad case-insensitive.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));
