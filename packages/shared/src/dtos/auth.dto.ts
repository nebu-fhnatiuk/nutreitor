import { z } from "zod";

import type { Capability } from "../auth/capabilities.js";
import type { Region } from "../region.js";

/** Roles dentro de una organización (espeja el enum de la DB). */
export const membershipRoles = ["admin", "professional", "patient"] as const;
export type MembershipRole = (typeof membershipRoles)[number];

/** Ruta de destino post-login según rol (dentro del workspace del tenant). */
export const roleHome: Record<MembershipRole, string> = {
  admin: "/admin",
  professional: "/pro",
  patient: "/app",
};

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginDto = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
}

/** Ciclo de vida de una org (espeja el enum de la DB, ADR 0025). */
export const orgStatuses = ["pending_review", "active", "rejected", "suspended"] as const;
export type OrgStatus = (typeof orgStatuses)[number];

/** Equipo o profesional independiente (org de una persona). */
export const orgKinds = ["team", "individual"] as const;
export type OrgKind = (typeof orgKinds)[number];

export interface AuthOrg {
  id: string;
  name: string;
  slug: string;
  region: Region;
  status: OrgStatus;
  kind: OrgKind;
}

/** Respuesta de /auth/me y /auth/login (sin tokens: van en cookies httpOnly). */
export interface MeResponse {
  user: AuthUser;
  org: AuthOrg;
  role: MembershipRole;
  /** Capacidades del rol en este tenant; la UI gatea acciones con esto. */
  capabilities: Capability[];
  /** Módulos/complementos ACTIVOS de la org (ej. "agents"); la UI gatea features. */
  modules: string[];
}

/** /auth/login agrega la ruta de destino por rol. */
export interface LoginResponse extends MeResponse {
  redirect: string;
}
