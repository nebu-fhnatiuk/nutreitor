import { z } from "zod";

/**
 * Solicitud de contacto desde la vidriera (ADR 0027): un visitante sin cuenta le
 * escribe a un profesional o al consultorio. La ve sólo el destinatario.
 */
export const contactRequestStatuses = ["new", "accepted", "declined"] as const;
export type ContactRequestStatus = (typeof contactRequestStatuses)[number];

/** Formulario público. `website` es un honeypot: si viene con algo, es un bot. */
export const publicContactSchema = z.object({
  /** Perfil del profesional; sin él, la consulta es para el consultorio. */
  profileSlug: z.string().min(2).max(63).optional(),
  fullName: z.string().trim().min(2, "Contanos tu nombre.").max(120),
  email: z.string().trim().toLowerCase().email("Revisá el email."),
  phone: z.string().trim().max(40).optional(),
  message: z
    .string()
    .trim()
    .min(10, "Contanos un poco más (mínimo 10 caracteres).")
    .max(1000, "Máximo 1000 caracteres."),
  consent: z.literal(true, {
    errorMap: () => ({ message: "Necesitamos tu consentimiento para responderte." }),
  }),
  website: z.string().max(200).optional(),
});
export type PublicContactDto = z.infer<typeof publicContactSchema>;

/** Respuesta pública: la misma siempre (no confirma nada sobre el email). */
export interface PublicContactResult {
  ok: true;
  /** A quién le llegó, para el mensaje de confirmación. */
  to: string;
}

/** Fila de la bandeja de solicitudes. */
export interface ContactRequestDto {
  id: string;
  /** null = para el consultorio. */
  membershipId: string | null;
  recipientName: string | null;
  fullName: string;
  email: string;
  phone: string | null;
  message: string;
  status: ContactRequestStatus;
  patientId: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export const contactListQuerySchema = z.object({
  status: z.enum(contactRequestStatuses).default("new"),
});
export type ContactListQueryDto = z.infer<typeof contactListQuerySchema>;

/** Aceptar: crea la ficha y la invita al portal. La admin elige a quién asignarla. */
export const acceptContactSchema = z.object({
  assignToMembershipId: z.string().uuid().optional(),
  /** Mandar la invitación al portal (por defecto sí). */
  invite: z.boolean().default(true),
});
export type AcceptContactDto = z.infer<typeof acceptContactSchema>;

export interface AcceptContactResult {
  patientId: string;
  invited: boolean;
  /** Si la invitación no salió (p. ej. el email ya es miembro), por qué. */
  inviteError: string | null;
}

export const declineContactSchema = z.object({
  /** Nota interna: NO se le manda al paciente. */
  note: z.string().trim().max(1000).optional(),
});
export type DeclineContactDto = z.infer<typeof declineContactSchema>;

/** Derivar una consulta del consultorio a un profesional (admin). */
export const forwardContactSchema = z.object({ membershipId: z.string().uuid() });
export type ForwardContactDto = z.infer<typeof forwardContactSchema>;
