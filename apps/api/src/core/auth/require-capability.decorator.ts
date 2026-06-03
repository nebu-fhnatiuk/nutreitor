import { SetMetadata } from "@nestjs/common";
import type { Capability } from "@nutreitor/shared";

export const CAPABILITIES_KEY = "capabilities";

/**
 * Restringe un handler/controller a quien tenga TODAS las capacidades listadas.
 * Autorización por capacidad, no por rol crudo. Requiere JwtAuthGuard antes
 * (que llena el ALS con el rol de la sesión).
 */
export const RequireCapability = (...caps: Capability[]) =>
  SetMetadata(CAPABILITIES_KEY, caps);
