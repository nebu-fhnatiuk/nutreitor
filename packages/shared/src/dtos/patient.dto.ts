import { z } from "zod";

/**
 * Alta de paciente (entidad clínica). NO incluye tenant_id ni region: se derivan
 * del TenantContext en el backend. `email` es contacto opcional, no credencial.
 */
export const createPatientSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().optional(),
});

export type CreatePatientDto = z.infer<typeof createPatientSchema>;

export interface PatientDto {
  id: string;
  fullName: string;
  email: string | null;
  region: string;
  /** Tiene cuenta de acceso vinculada (aceptó una invitación). */
  hasAccount: boolean;
  createdAt: string;
}
