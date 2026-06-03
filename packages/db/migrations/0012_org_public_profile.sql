-- ─────────────────────────────────────────────────────────────────────────────
-- 0012_org_public_profile — texto de la página pública de la organización.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS public_headline    text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS public_description text;
