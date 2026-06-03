-- ─────────────────────────────────────────────────────────────────────────────
-- 0008_org_branding — branding white-label por organización (acotado).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS display_name          text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_logo_url        text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_primary_color   text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_secondary_color text;
