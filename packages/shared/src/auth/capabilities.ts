import type { MembershipRole } from "../dtos/auth.dto.js";

/**
 * Autorización por CAPACIDADES, no por chequeo de rol crudo. El código y la UI
 * razonan sobre capacidades; el mapa rol→capacidades es la única fuente de verdad.
 *
 * Hoy el mapa está hardcodeado (3 roles estáticos). Está estructurado para migrar
 * a permisos DB-driven (roles custom por tenant) sin tocar los call sites: sólo
 * cambiaría de dónde sale `capabilitiesForRole`.
 */
export const capabilities = [
  "member:read",
  "member:invite",
  "member:revoke",
  "member:change_role",
  "patient:create",
  "patient:read",
  "patient:read_clinical",
  "patient:update",
  "patient:update_clinical_visibility",
  "patient:assign",
  "patient:add_note",
  "metric:read",
  "metric:record",
  "plan:read",
  "plan:write",
  "food:read",
  "food:manage",
  "appointment:read",
  "appointment:write",
  "agent:use",
  "message:send",
  "portal:read",
  "portal:self_report",
  "portal:book",
  "portal:agent",
  "portal:message",
  "org:read",
  "org:manage_modules",
  "org:update_branding",
  "org:update_public_profile",
  "professional:update_own_profile",
  "audit:read",
] as const;

export type Capability = (typeof capabilities)[number];

/** Mapa rol → capacidades dentro del tenant. */
export const roleCapabilities: Record<MembershipRole, Capability[]> = {
  admin: [...capabilities], // el admin del tenant tiene todas
  professional: [
    "member:read",
    "patient:read",
    "patient:read_clinical",
    "patient:update",
    "patient:update_clinical_visibility",
    "patient:add_note",
    "metric:read",
    "metric:record",
    "plan:read",
    "plan:write",
    "food:read",
    "food:manage",
    "appointment:read",
    "appointment:write",
    "agent:use",
    "message:send",
    "org:read",
    "professional:update_own_profile",
    // NO `patient:create` ni `patient:assign`: el ALTA y la asignación son del
    // admin (el alta crea-y-asigna en un paso; evita pacientes huérfanos que el
    // profesional no podría ver por el scoping assigned-only). El profesional
    // read/update/add_note queda acotado a pacientes ASIGNADOS en la capa de
    // servicio (la capability es condición necesaria, no suficiente).
  ],
  // El paciente opera SÓLO su portal (su propia entidad), nunca el panel de
  // gestión. El portal resuelve "mi paciente" por userId (además de RLS de tenant).
  patient: ["org:read", "portal:read", "portal:self_report", "portal:book", "portal:agent", "portal:message"],
};

/** Capacidades de un rol (defensivo ante un rol desconocido). */
export function capabilitiesForRole(role: MembershipRole): Capability[] {
  return roleCapabilities[role] ?? [];
}

/** ¿El rol tiene la capacidad? */
export function hasCapability(role: MembershipRole, capability: Capability): boolean {
  return capabilitiesForRole(role).includes(capability);
}
