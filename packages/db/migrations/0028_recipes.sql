-- ─────────────────────────────────────────────────────────────────────────────
-- 0028_recipes — recetas (ADR 0019).
--
-- Dos capas, igual que los alimentos (ADR 0018):
--  - recipe_library: recetario de REFERENCIA global (sin tenant, sin PHI), sólo
--    lectura para el rol app; se carga por migración generada. Sus ingredientes
--    referencian el catálogo por `slug` (los ids del catálogo cambian entre bases).
--  - tenant_recipes: recetas propias del consultorio (RLS); pueden usar alimentos
--    del catálogo (por slug) y propios del consultorio (por id).
--
-- `ingredients` = [{ "kind": "catalog", "slug": "arroz-blanco-cocido", "grams": 160 }
--                | { "kind": "tenant", "id": "<uuid>", "grams": 50 }]
-- Los nutrientes NO se guardan: se calculan al servir la receta desde sus
-- ingredientes, así una corrección del catálogo llega sola a todas las recetas.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recipe_library (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Clave estable del curado: idempotencia del seed y referencia entre entornos.
  slug         text         NOT NULL UNIQUE,
  name         text         NOT NULL,
  category     text         NOT NULL,
  servings     integer      NOT NULL CHECK (servings BETWEEN 1 AND 50),
  ingredients  jsonb        NOT NULL,
  steps        text,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipe_library_name_trgm_idx
  ON recipe_library USING gin (immutable_unaccent(lower(name)) gin_trgm_ops);

-- Referencia global: el runtime sólo lee.
GRANT SELECT ON recipe_library TO nutreitor_app;

CREATE TABLE IF NOT EXISTS tenant_recipes (
  id                       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid         NOT NULL,
  region                   region       NOT NULL,
  name                     text         NOT NULL,
  category                 text         NOT NULL,
  servings                 integer      NOT NULL CHECK (servings BETWEEN 1 AND 50),
  ingredients              jsonb        NOT NULL,
  steps                    text,
  created_by_membership_id uuid         NOT NULL,
  -- Baja lógica: un plan viejo puede referenciarla (el item guarda copia).
  archived_at              timestamptz,
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT tenant_recipes_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT tenant_recipes_created_by_membership_id_fk
    FOREIGN KEY (created_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS tenant_recipes_tenant_idx ON tenant_recipes (tenant_id);
CREATE INDEX IF NOT EXISTS tenant_recipes_name_trgm_idx
  ON tenant_recipes USING gin (immutable_unaccent(lower(name)) gin_trgm_ops);

-- Sin DELETE: se archiva.
GRANT SELECT, INSERT, UPDATE ON tenant_recipes TO nutreitor_app;

ALTER TABLE tenant_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_recipes FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_recipes
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
