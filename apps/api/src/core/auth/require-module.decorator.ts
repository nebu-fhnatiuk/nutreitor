import { SetMetadata } from "@nestjs/common";
import type { ModuleKey } from "@nutreitor/shared";

export const MODULE_KEY = "required_module";

/**
 * Exige que la ORG tenga el módulo/complemento ACTIVO (entitlement a nivel tenant),
 * además de la capability del rol. Requiere JwtAuthGuard antes (contexto de tenant)
 * y ModuleGuard en el pipeline. Ver ADR 0016.
 */
export const RequireModule = (module: ModuleKey) => SetMetadata(MODULE_KEY, module);
