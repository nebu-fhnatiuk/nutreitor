-- ─────────────────────────────────────────────────────────────────────────────
-- 0055_allergens — alérgenos estructurados (KAN-105, ADR 0052).
--
-- Marcas de alérgenos en el catálogo y en los alimentos propios, y casillas de
-- alergias e intolerancias en la ficha. Lista validada por la nutricionista en
-- docs/validation/alergenos.md (CAA art. 235 séptimo + sésamo + lactosa).
-- Los valores del catálogo salen de packages/db/catalog/foods-ar.curation.json
-- (`allergens`); el test catalog-allergens.e2e verifica que coincidan.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE food_catalog ADD COLUMN IF NOT EXISTS allergens text[] NOT NULL DEFAULT '{}'
  CONSTRAINT food_catalog_allergens_ck CHECK (allergens <@ ARRAY['tacc', 'leche', 'huevo', 'pescado', 'crustaceos', 'mani', 'frutos_secos', 'soja', 'sulfitos', 'sesamo', 'lactosa']::text[]);
ALTER TABLE tenant_foods ADD COLUMN IF NOT EXISTS allergens text[] NOT NULL DEFAULT '{}'
  CONSTRAINT tenant_foods_allergens_ck CHECK (allergens <@ ARRAY['tacc', 'leche', 'huevo', 'pescado', 'crustaceos', 'mani', 'frutos_secos', 'soja', 'sulfitos', 'sesamo', 'lactosa']::text[]);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS allergy_flags text[] NOT NULL DEFAULT '{}'
  CONSTRAINT patients_allergy_flags_ck CHECK (allergy_flags <@ ARRAY['tacc', 'leche', 'huevo', 'pescado', 'crustaceos', 'mani', 'frutos_secos', 'soja', 'sulfitos', 'sesamo', 'celiaquia', 'intolerancia_lactosa']::text[]);

-- Catálogo: alérgenos validados (los demás alimentos quedan sin marcas).
UPDATE food_catalog SET allergens = ARRAY['leche', 'lactosa']::text[] WHERE slug = 'leche-entera';
UPDATE food_catalog SET allergens = ARRAY['leche', 'lactosa']::text[] WHERE slug = 'leche-descremada';
UPDATE food_catalog SET allergens = ARRAY['leche', 'lactosa']::text[] WHERE slug = 'yogur-entero-natural';
UPDATE food_catalog SET allergens = ARRAY['leche', 'lactosa']::text[] WHERE slug = 'yogur-descremado-natural';
UPDATE food_catalog SET allergens = ARRAY['leche', 'lactosa']::text[] WHERE slug = 'yogur-griego-natural';
UPDATE food_catalog SET allergens = ARRAY['leche', 'lactosa']::text[] WHERE slug = 'queso-cremoso';
UPDATE food_catalog SET allergens = ARRAY['leche', 'lactosa']::text[] WHERE slug = 'queso-untable-descremado';
UPDATE food_catalog SET allergens = ARRAY['leche', 'lactosa']::text[] WHERE slug = 'queso-crema';
UPDATE food_catalog SET allergens = ARRAY['leche']::text[] WHERE slug = 'queso-rallado';
UPDATE food_catalog SET allergens = ARRAY['leche', 'lactosa']::text[] WHERE slug = 'ricota';
UPDATE food_catalog SET allergens = ARRAY['leche']::text[] WHERE slug = 'manteca';
UPDATE food_catalog SET allergens = ARRAY['leche', 'lactosa']::text[] WHERE slug = 'crema-de-leche';
UPDATE food_catalog SET allergens = ARRAY['huevo']::text[] WHERE slug = 'huevo-entero';
UPDATE food_catalog SET allergens = ARRAY['huevo']::text[] WHERE slug = 'clara-de-huevo';
UPDATE food_catalog SET allergens = ARRAY['huevo']::text[] WHERE slug = 'huevo-duro';
UPDATE food_catalog SET allergens = ARRAY['pescado']::text[] WHERE slug = 'merluza-cocida';
UPDATE food_catalog SET allergens = ARRAY['pescado']::text[] WHERE slug = 'salmon-cocido';
UPDATE food_catalog SET allergens = ARRAY['pescado']::text[] WHERE slug = 'atun-al-agua';
UPDATE food_catalog SET allergens = ARRAY['pescado']::text[] WHERE slug = 'atun-en-aceite';
UPDATE food_catalog SET allergens = ARRAY['pescado']::text[] WHERE slug = 'sardinas-en-aceite';
UPDATE food_catalog SET allergens = ARRAY['tacc']::text[] WHERE slug = 'fideos-cocidos';
UPDATE food_catalog SET allergens = ARRAY['tacc']::text[] WHERE slug = 'fideos-integrales-cocidos';
UPDATE food_catalog SET allergens = ARRAY['tacc']::text[] WHERE slug = 'avena-arrollada';
UPDATE food_catalog SET allergens = ARRAY['tacc']::text[] WHERE slug = 'pan-blanco';
UPDATE food_catalog SET allergens = ARRAY['tacc']::text[] WHERE slug = 'pan-integral';
UPDATE food_catalog SET allergens = ARRAY['tacc']::text[] WHERE slug = 'galletitas-de-agua';
UPDATE food_catalog SET allergens = ARRAY['tacc']::text[] WHERE slug = 'harina-de-trigo';
UPDATE food_catalog SET allergens = ARRAY['tacc']::text[] WHERE slug = 'copos-de-maiz';
UPDATE food_catalog SET allergens = ARRAY['soja']::text[] WHERE slug = 'soja-texturizada';
UPDATE food_catalog SET allergens = ARRAY['soja']::text[] WHERE slug = 'tofu';
UPDATE food_catalog SET allergens = ARRAY['frutos_secos']::text[] WHERE slug = 'almendras';
UPDATE food_catalog SET allergens = ARRAY['frutos_secos']::text[] WHERE slug = 'nueces';
UPDATE food_catalog SET allergens = ARRAY['mani']::text[] WHERE slug = 'mani-tostado';
UPDATE food_catalog SET allergens = ARRAY['mani']::text[] WHERE slug = 'pasta-de-mani';
UPDATE food_catalog SET allergens = ARRAY['huevo']::text[] WHERE slug = 'mayonesa';
UPDATE food_catalog SET allergens = ARRAY['leche', 'lactosa']::text[] WHERE slug = 'dulce-de-leche';
UPDATE food_catalog SET allergens = ARRAY['soja']::text[] WHERE slug = 'chocolate-amargo';
UPDATE food_catalog SET allergens = ARRAY['frutos_secos']::text[] WHERE slug = 'bebida-de-almendras';
UPDATE food_catalog SET allergens = ARRAY['sesamo']::text[] WHERE slug = 'hummus';
UPDATE food_catalog SET allergens = ARRAY['leche', 'lactosa']::text[] WHERE slug = 'proteina-whey';
