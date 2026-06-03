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

export interface AuthOrg {
  id: string;
  name: string;
  slug: string;
  region: Region;
}

/** Respuesta de /auth/me y /auth/login (sin tokens: van en cookies httpOnly). */
export interface MeResponse {
  user: AuthUser;
  org: AuthOrg;
  role: MembershipRole;
  /** Capacidades del rol en este tenant; la UI gatea acciones con esto. */
  capabilities: Capability[];
}

/** /auth/login agrega la ruta de destino por rol. */
export interface LoginResponse extends MeResponse {
  redirect: string;
}
