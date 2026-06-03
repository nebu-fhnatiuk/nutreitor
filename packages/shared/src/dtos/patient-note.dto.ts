import { z } from "zod";

/**
 * Nota clínica del profesional. Append-only: cada entrada con autor (membership)
 * y timestamp; nunca se edita ni borra (la inmutabilidad la fuerza el GRANT en DB,
 * igual que el audit log). Corregir = nueva entrada.
 */
export const addPatientNoteSchema = z.object({
  content: z.string().min(1).max(8000),
});
export type AddPatientNoteDto = z.infer<typeof addPatientNoteSchema>;

export interface PatientNoteDto {
  id: string;
  authorMembershipId: string;
  /** Nombre del autor (del user del membership), para mostrar. */
  authorName: string;
  content: string;
  createdAt: string;
}
