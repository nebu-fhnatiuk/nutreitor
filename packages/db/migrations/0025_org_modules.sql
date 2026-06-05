-- ─────────────────────────────────────────────────────────────────────────────
-- 0025_org_modules — módulos/complementos instalables por organización.
--
-- Entitlements a nivel TENANT, ortogonales a las capacidades por rol: aunque un
-- usuario tenga la capability, si su org no tiene el módulo ACTIVO, el gateway corta
-- (ver ModuleGuard y ADR 0016). Hoy el único módulo cableado es 'agents' (NUTRI/CHEF/
-- PSICO), apagado por default; el admin lo instala aceptando términos + plan.
--
-- `module` es text (no enum) para sumar complementos sin migración de tipo. Una fila
-- por (tenant, module). Desinstalar es soft: status='inactive', se conservan datos.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_modules (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL,
  region                      region      NOT NULL,
  module                      text        NOT NULL,
  -- active | inactive (text: el ciclo de vida puede crecer sin acoplar un enum).
  status                      text        NOT NULL DEFAULT 'inactive',
  -- Plan elegido al instalar (identificador, ej. 'standard'). Sin cobro real aún.
  plan                        text,
  -- Versión del contrato/términos aceptada + quién/cuándo (registro comercial).
  terms_version               text,
  installed_by_membership_id  uuid,
  installed_at                timestamptz,
  uninstalled_at              timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_modules_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT org_modules_tenant_module_uq UNIQUE (tenant_id, module)
);

-- nutreitor_app: el admin del tenant lista/instala/desinstala (upsert + toggle).
GRANT SELECT, INSERT, UPDATE ON org_modules TO nutreitor_app;

-- RLS: aislamiento por tenant, fail-closed.
ALTER TABLE org_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_modules FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON org_modules
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
