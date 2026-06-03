import { z } from "zod";

import { membershipRoles, type MembershipRole } from "./auth.dto.js";

/** Alta de invitación (admin). El email se normaliza a lowercase en el backend. */
export const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(membershipRoles),
  // Vincular una entidad paciente existente a la cuenta del invitado (opcional).
  patientId: z.string().uuid().optional(),
});

export type CreateInvitationDto = z.infer<typeof createInvitationSchema>;

/** Aceptación de invitación. password/fullName requeridos sólo si la cuenta es nueva. */
export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).optional(),
  fullName: z.string().min(1).max(200).optional(),
});

export type AcceptInvitationDto = z.infer<typeof acceptInvitationSchema>;

/** Invitación pendiente (listado admin). */
export interface InvitationDto {
  id: string;
  email: string;
  role: MembershipRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
}

/** Preview público para la página de aceptación (resuelto por token). */
export interface InvitationPreview {
  email: string;
  role: MembershipRole;
  orgName: string;
  /** El email todavía no es una cuenta → la aceptación pide password + nombre. */
  needsAccount: boolean;
}
