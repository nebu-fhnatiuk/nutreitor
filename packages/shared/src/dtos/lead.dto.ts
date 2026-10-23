import { z } from "zod";

/**
 * Consulta comercial desde la landing ("Hablemos para tu club", KAN-80, ADR 0041).
 * Es de quien escribe sobre su organización, no de un deportista: nunca datos de
 * salud. Plano de control: la ven sólo los operadores de la plataforma.
 */

export const leadOrgKinds = ["club", "gimnasio", "consultorio", "otro"] as const;
export type LeadOrgKind = (typeof leadOrgKinds)[number];
export const LEAD_ORG_KIND_LABEL: Record<LeadOrgKind, string> = {
  club: "Club",
  gimnasio: "Gimnasio",
  consultorio: "Consultorio o equipo de nutrición",
  otro: "Otro",
};

export const leadRoles = ["nutricion", "coordinacion", "cuerpo_tecnico", "dirigencia", "otro"] as const;
export type LeadRole = (typeof leadRoles)[number];
export const LEAD_ROLE_LABEL: Record<LeadRole, string> = {
  nutricion: "Nutricionista",
  coordinacion: "Coordinación de nutrición",
  cuerpo_tecnico: "Cuerpo técnico",
  dirigencia: "Dirigencia o gerencia",
  otro: "Otro",
};

export const leadSizes = ["hasta_30", "31_100", "101_300", "mas_300"] as const;
export type LeadSize = (typeof leadSizes)[number];
export const LEAD_SIZE_LABEL: Record<LeadSize, string> = {
  hasta_30: "Hasta 30",
  "31_100": "31 a 100",
  "101_300": "101 a 300",
  mas_300: "Más de 300",
};

export const leadStatuses = ["new", "contacted", "closed"] as const;
export type LeadStatus = (typeof leadStatuses)[number];
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nueva",
  contacted: "Contactada",
  closed: "Cerrada",
};

/** Lo que manda el formulario. `website` es un campo trampa: una persona no lo ve. */
export const createLeadSchema = z.object({
  fullName: z.string().trim().min(2, "Escribí tu nombre.").max(120),
  email: z.string().trim().toLowerCase().email("Revisá el email."),
  orgName: z.string().trim().min(2, "Escribí el nombre del club u organización.").max(120),
  orgKind: z.enum(leadOrgKinds),
  role: z.enum(leadRoles),
  athletes: z.enum(leadSizes),
  message: z
    .string()
    .trim()
    .max(1000, "Máximo 1000 caracteres.")
    .optional()
    .transform((v) => (v ? v : null)),
  consent: z.literal(true, { errorMap: () => ({ message: "Necesitamos tu OK para contactarte." }) }),
  website: z.string().max(200).optional(),
});
export type CreateLeadDto = z.infer<typeof createLeadSchema>;

export const updateLeadStatusSchema = z.object({ status: z.enum(leadStatuses) });
export type UpdateLeadStatusDto = z.infer<typeof updateLeadStatusSchema>;

export interface SalesLeadDto {
  id: string;
  fullName: string;
  email: string;
  orgName: string;
  orgKind: LeadOrgKind;
  role: LeadRole;
  athletes: LeadSize;
  message: string | null;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
  /** Quién la marcó por última vez (operador de plataforma). */
  handledBy: string | null;
}
