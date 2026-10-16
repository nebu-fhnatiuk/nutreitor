-- ─────────────────────────────────────────────────────────────────────────────
-- 0026_foods — base de alimentos para el cálculo nutricional del plan (ADR 0018).
--
-- Dos capas:
--  - food_catalog: catálogo de REFERENCIA global (sin tenant, sin PHI). Valores por
--    100 g tomados de USDA FoodData Central (CC0) + capa curada AR (nombre local,
--    grupo, medidas caseras). El rol app sólo LEE: se carga por seed/migración con
--    el owner. Fuera de RLS a propósito (declarado en el test de catálogo RLS).
--  - tenant_foods: alimentos propios de cada consultorio (mismas columnas), bajo RLS.
--
-- Nutrientes por 100 g de porción comestible. `portions` = medidas caseras
-- [{ "label": "1 taza", "grams": 160 }]. `extra` = micronutrientes opcionales.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS food_catalog (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Clave estable del curado (p. ej. "arroz-blanco-cocido"): idempotencia del seed.
  slug           text          NOT NULL UNIQUE,
  name           text          NOT NULL,
  food_group     text          NOT NULL,
  -- Procedencia del dato nutricional (atribución): "usda" + fdc_id.
  source         text          NOT NULL,
  source_ref     text,
  energy_kcal    numeric(7, 2) NOT NULL,
  protein_g      numeric(6, 2) NOT NULL,
  carbs_g        numeric(6, 2) NOT NULL,
  fat_g          numeric(6, 2) NOT NULL,
  fiber_g        numeric(6, 2),
  sugars_g       numeric(6, 2),
  sat_fat_g      numeric(6, 2),
  sodium_mg      numeric(8, 2),
  portions       jsonb         NOT NULL DEFAULT '[]'::jsonb,
  extra          jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

-- Búsqueda por nombre sin acentos ni mayúsculas (el editor busca "almendra").
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() no es IMMUTABLE: envoltorio inmutable para poder indexar.
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

CREATE INDEX IF NOT EXISTS food_catalog_name_trgm_idx
  ON food_catalog USING gin (immutable_unaccent(lower(name)) gin_trgm_ops);

-- Referencia global: el runtime sólo lee. Altas y correcciones van por seed/owner.
GRANT SELECT ON food_catalog TO nutreitor_app;

CREATE TABLE IF NOT EXISTS tenant_foods (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid          NOT NULL,
  region                   region        NOT NULL,
  name                     text          NOT NULL,
  food_group               text          NOT NULL,
  energy_kcal              numeric(7, 2) NOT NULL,
  protein_g                numeric(6, 2) NOT NULL,
  carbs_g                  numeric(6, 2) NOT NULL,
  fat_g                    numeric(6, 2) NOT NULL,
  fiber_g                  numeric(6, 2),
  sugars_g                 numeric(6, 2),
  sat_fat_g                numeric(6, 2),
  sodium_mg                numeric(8, 2),
  portions                 jsonb         NOT NULL DEFAULT '[]'::jsonb,
  extra                    jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_by_membership_id uuid          NOT NULL,
  -- Baja lógica: un plan viejo puede referenciarlo (los macros del item son copia).
  archived_at              timestamptz,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT tenant_foods_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT tenant_foods_created_by_membership_id_fk
    FOREIGN KEY (created_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS tenant_foods_tenant_idx ON tenant_foods (tenant_id);
CREATE INDEX IF NOT EXISTS tenant_foods_name_trgm_idx
  ON tenant_foods USING gin (immutable_unaccent(lower(name)) gin_trgm_ops);

-- Sin DELETE: se archiva (archived_at), como el resto de la data clínica.
GRANT SELECT, INSERT, UPDATE ON tenant_foods TO nutreitor_app;

ALTER TABLE tenant_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_foods FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_foods
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
