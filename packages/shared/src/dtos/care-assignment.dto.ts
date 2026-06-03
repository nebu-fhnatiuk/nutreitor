import { z } from "zod";

/**
 * Asignación paciente↔profesional (M:N, versionada). Referencia el MEMBERSHIP del
 * profesional (no el user global), coherente con el modelo multi-org. La sede es
 * referencia opcional (sin UI en este sprint).
 */
export const assignCareSchema = z.object({
  membershipId: z.string().uuid(),
  locationId: z.string().uuid().nullish(),
});
export type AssignCareDto = z.infer<typeof assignCareSchema>;

export type CareAssignmentStatus = "active" | "ended";

export interface CareAssignmentDto {
  id: string;
  membershipId: string;
  /** Nombre del profesional (del user del membership), para mostrar. */
  professionalName: string;
  status: CareAssignmentStatus;
  assignedAt: string;
  endedAt: string | null;
}
