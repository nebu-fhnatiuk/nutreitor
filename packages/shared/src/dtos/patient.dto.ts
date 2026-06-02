import { z } from "zod";

/**
 * Alta de paciente. Notar que NO incluye tenant_id ni region: ambos se derivan
 * del TenantContext en el backend. Aceptarlos desde el request sería exactamente
 * el anti-patrón que el modelo prohíbe.
 */
export const createPatientSchema = z.object({
  fullName: z.string().min(1).max(200),
});

export type CreatePatientDto = z.infer<typeof createPatientSchema>;

export interface PatientDto {
  id: string;
  fullName: string;
  region: string;
  createdAt: string;
}
