import { z } from "zod";

import type { CareAssignmentDto } from "./care-assignment.dto.js";
import type { PatientNoteDto } from "./patient-note.dto.js";

/** Catálogos acotados a nivel app (Zod), NO enums de DB: el catálogo evoluciona
 * sin migración (la columna es text). Habilitan dropdowns en la UI. */
export const patientSexes = ["female", "male", "other", "unspecified"] as const;
export type PatientSex = (typeof patientSexes)[number];

export const activityLevels = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;
export type ActivityLevel = (typeof activityLevels)[number];

/**
 * Campos SOBRESCRIBIBLES de la ficha (estado actual del paciente). `nullish`:
 * `undefined` = sin cambio, `null` = limpiar. La serie temporal de peso/medidas
 * NO va acá (es el sprint de métricas): sólo el dato antropométrico BASAL.
 */
const patientFichaFields = {
  // Identificación / contacto
  documentId: z.string().max(60).nullish(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha esperada YYYY-MM-DD")
    .nullish(),
  sex: z.enum(patientSexes).nullish(),
  email: z.string().email().max(200).nullish(),
  phone: z.string().max(40).nullish(),
  country: z.string().max(60).nullish(),
  timezone: z.string().max(60).nullish(),
  // Clínicos de base
  reasonForConsult: z.string().max(4000).nullish(),
  medicalHistory: z.string().max(8000).nullish(),
  allergies: z.string().max(4000).nullish(),
  currentMedication: z.string().max(4000).nullish(),
  diagnosedConditions: z.string().max(4000).nullish(),
  familyHistory: z.string().max(4000).nullish(),
  // Antropométrico BASAL (dato fijo inicial)
  heightCm: z.number().int().min(1).max(300).nullish(),
  initialWeightKg: z.number().min(1).max(1000).nullish(),
  // Hábitos / contexto
  activityLevel: z.enum(activityLevels).nullish(),
  goal: z.string().max(200).nullish(),
  dietaryPreferences: z.string().max(2000).nullish(),
  // Sede (referencia; sin UI en este sprint)
  locationId: z.string().uuid().nullish(),
};

/**
 * Alta de paciente. NO incluye tenant_id ni region (se derivan del contexto).
 * `assignToMembershipId` es el atajo de un paso (crear-y-asignar): por debajo
 * invoca la MISMA operación de asignación que la reasignación.
 */
export const createPatientSchema = z.object({
  fullName: z.string().min(1).max(200),
  ...patientFichaFields,
  assignToMembershipId: z.string().uuid().optional(),
});
export type CreatePatientDto = z.infer<typeof createPatientSchema>;

/** Edición de los campos sobrescribibles de la ficha. */
export const updatePatientSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  ...patientFichaFields,
});
export type UpdatePatientDto = z.infer<typeof updatePatientSchema>;

/** Fila del listado de pacientes (resumen). */
export interface PatientDto {
  id: string;
  fullName: string;
  documentId: string | null;
  email: string | null;
  region: string;
  /** Tiene cuenta de acceso vinculada (aceptó una invitación). */
  hasAccount: boolean;
  /** Profesionales con asignación ACTIVA (nombres), para contexto del listado. */
  activeProfessionals: string[];
  archived: boolean;
  createdAt: string;
}

/** Bloque clínico sensible (gateado por patient:read_clinical). */
export interface PatientClinical {
  reasonForConsult: string | null;
  medicalHistory: string | null;
  allergies: string | null;
  currentMedication: string | null;
  diagnosedConditions: string | null;
  familyHistory: string | null;
}

/** Ficha completa del paciente. `clinical` = null si la sesión no tiene
 * patient:read_clinical. `assignments` y `notes` se devuelven con la ficha. */
export interface PatientDetailDto {
  id: string;
  fullName: string;
  documentId: string | null;
  birthDate: string | null;
  sex: PatientSex | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  timezone: string | null;
  heightCm: number | null;
  initialWeightKg: number | null;
  activityLevel: ActivityLevel | null;
  goal: string | null;
  dietaryPreferences: string | null;
  locationId: string | null;
  region: string;
  hasAccount: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  clinical: PatientClinical | null;
  assignments: CareAssignmentDto[];
  notes: PatientNoteDto[];
}
