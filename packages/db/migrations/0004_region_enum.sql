-- ─────────────────────────────────────────────────────────────────────────────
-- 0004_region_enum — unifica `region` a un enum en todas las tablas.
--
-- Antes era `text` en organizations/patients/memberships/refresh_tokens
-- (inconsistente y sin gobernar el set de regiones). El enum impide valores
-- arbitrarios, clave porque region gobierna residencia de datos. `region` queda
-- DENORMALIZADO en cada tabla (viaja con el dato; routing/SILO sin join).
--
-- Agregar una región nueva: ALTER TYPE region ADD VALUE 'xx-xxxx-N';
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'region') THEN
    CREATE TYPE region AS ENUM ('us-east-1', 'eu-central-1', 'sa-east-1');
  END IF;
END
$$;

-- Cast text → enum. Los valores existentes (us-east-1 / eu-central-1) son labels
-- válidos, así que el USING no falla.
ALTER TABLE organizations  ALTER COLUMN region TYPE region USING region::region;
ALTER TABLE patients       ALTER COLUMN region TYPE region USING region::region;
ALTER TABLE memberships    ALTER COLUMN region TYPE region USING region::region;
ALTER TABLE refresh_tokens ALTER COLUMN region TYPE region USING region::region;
