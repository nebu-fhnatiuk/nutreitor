-- ─────────────────────────────────────────────────────────────────────────────
-- 0048_sales_leads — consultas comerciales desde la landing (KAN-80, ADR 0041).
--
-- "Hablemos para tu club": quien escribe deja sus datos de contacto y los de su
-- organización. Plano de control, como `org_signups` (ADR 0025): sin tenant ni
-- RLS, y el rol app NO tiene grants; la API la opera con la conexión owner y sólo
-- los operadores de plataforma la leen. No guarda datos de salud.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sales_leads (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     text        NOT NULL CHECK (length(full_name) BETWEEN 2 AND 120),
  email         text        NOT NULL CHECK (length(email) <= 254),
  org_name      text        NOT NULL CHECK (length(org_name) BETWEEN 2 AND 120),
  org_kind      text        NOT NULL CHECK (org_kind IN ('club', 'gimnasio', 'consultorio', 'otro')),
  role          text        NOT NULL CHECK (role IN ('nutricion', 'coordinacion', 'cuerpo_tecnico', 'dirigencia', 'otro')),
  athletes      text        NOT NULL CHECK (athletes IN ('hasta_30', '31_100', '101_300', 'mas_300')),
  message       text        CHECK (length(message) <= 1000),
  status        text        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  -- Momento en que aceptó que lo contactemos (el formulario lo exige).
  consent_at    timestamptz NOT NULL,
  handled_by    uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_leads_status_idx ON sales_leads (status, created_at DESC);

-- Plano de control: el rol app no la ve.
REVOKE ALL ON sales_leads FROM nutreitor_app;
