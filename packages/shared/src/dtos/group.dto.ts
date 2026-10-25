import { z } from "zod";

import type { AnthroResults } from "../anthropometry.js";
import type { BoardStatus } from "../squad-board.js";
import { saveAnthropometrySchema } from "./anthropometry.dto.js";

/**
 * Grupos de deportistas (ADR 0031): plantel, división o turno. Los arma el admin
 * (`group:manage`); el profesional los ve acotados a sus pacientes asignados.
 */
export const saveGroupSchema = z.object({
  name: z.string().trim().min(1, "Poné un nombre.").max(80),
  description: z.string().trim().max(300).nullish(),
});
export type SaveGroupDto = z.infer<typeof saveGroupSchema>;

export const addGroupMembersSchema = z.object({
  patientIds: z.array(z.string().uuid()).min(1).max(200),
});
export type AddGroupMembersDto = z.infer<typeof addGroupMembersSchema>;

/** Asignar un profesional a todo el grupo (KAN-32). */
export const assignGroupProfessionalSchema = z.object({
  membershipId: z.string().uuid(),
});
export type AssignGroupProfessionalDto = z.infer<typeof assignGroupProfessionalSchema>;

export interface AssignGroupProfessionalResultDto {
  /** Asignaciones nuevas. */
  assigned: number;
  /** Ya tenían a ese profesional: no se tocan. */
  alreadyAssigned: number;
}

/**
 * Aplicar una plantilla a todo el grupo (KAN-33): cada deportista visible recibe una
 * versión nueva de SU plan con una copia de la plantilla (después se ajusta de a uno).
 */
export const applyGroupPlanSchema = z.object({
  templateId: z.string().uuid(),
  /** Título del plan; por defecto, el nombre de la plantilla. */
  title: z.string().trim().min(1).max(200).nullish(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha esperada YYYY-MM-DD")
    .nullish(),
  /** Sólo a quienes no tienen un plan vigente (no reemplaza ninguno). */
  onlyWithoutPlan: z.boolean().default(false),
});
export type ApplyGroupPlanDto = z.infer<typeof applyGroupPlanSchema>;

export interface ApplyGroupPlanResultDto {
  /** Recibieron el plan (versión nueva). */
  applied: number;
  /** De esos, cuántos tenían un plan vigente que pasó al historial. */
  replaced: number;
  /** No lo recibieron porque ya tenían plan (`onlyWithoutPlan`). */
  skipped: number;
}

/** Referencia liviana para listados y la ficha. */
export interface GroupRefDto {
  id: string;
  name: string;
}

export interface GroupDto extends GroupRefDto {
  description: string | null;
  /** Miembros que la sesión puede ver (al profesional, sólo sus asignados). */
  memberCount: number;
  createdAt: string;
}

export interface GroupMemberDto {
  patientId: string;
  fullName: string;
  sex: string | null;
  birthDate: string | null;
}

export interface GroupDetailDto extends GroupDto {
  members: GroupMemberDto[];
}

/** Máximo de deportistas por carga de plantel (un plantel largo + juveniles). */
export const GROUP_BATCH_MAX = 60;

/**
 * Carga de antropometría de un plantel: una sesión por deportista, misma fecha.
 * Cada entrada se valida con la misma regla que la carga individual (rangos y 3ª toma).
 */
export const saveGroupAnthropometrySchema = z.object({
  measuredAt: saveAnthropometrySchema.shape.measuredAt,
  entries: z
    .array(
      z.object({
        patientId: z.string().uuid(),
        takes: saveAnthropometrySchema.shape.takes,
        note: saveAnthropometrySchema.shape.note,
      }),
    )
    .min(1, "No hay mediciones para guardar.")
    .max(GROUP_BATCH_MAX)
    .refine((e) => new Set(e.map((x) => x.patientId)).size === e.length, "Un deportista aparece dos veces."),
});
export type SaveGroupAnthropometryDto = z.infer<typeof saveGroupAnthropometrySchema>;

export interface GroupAnthropometryResultDto {
  created: number;
}

/** Fila del resumen del plantel: la última sesión de cada deportista. */
export interface GroupAnthropometryRowDto {
  patientId: string;
  fullName: string;
  /** null si nunca se lo midió. */
  last: {
    sessionId: string;
    measuredAt: string;
    bodyMass: number | null;
    results: AnthroResults;
  } | null;
  /** Variación de Σ6 contra la sesión anterior (mm), si ambas lo tienen. */
  sum6Delta: number | null;
}

export interface GroupAnthropometrySummaryDto {
  validated: boolean;
  rows: GroupAnthropometryRowDto[];
}

/** Una tarjeta de la pizarra del plantel (KAN-70). */
export interface GroupBoardRowDto {
  patientId: string;
  fullName: string;
  lastMeasuredOn: string | null;
  bodyMass: number | null;
  sum6: number | null;
  sum6Delta: number | null;
  sweatRateLh: number | null;
  lossPct: number | null;
  adherence7: number | null;
  adherencePrev7: number | null;
  /** Plan vigente (KAN-34); null = sin plan. */
  activePlan: { title: string; version: number } | null;
  status: BoardStatus;
}

/** Cobertura del grupo (KAN-34): cuánto del plantel tiene plan, medición y registro. */
export interface GroupCoverageDto {
  /** Deportistas visibles del grupo. */
  members: number;
  withPlan: number;
  /** Medidos (antropometría) en los últimos 30 días. */
  measured30: number;
  /** Última antropometría de cualquier deportista del grupo (YYYY-MM-DD). */
  lastMeasuredOn: string | null;
  /** Adherencia de 30 días sobre todo lo registrado por el grupo (%). */
  adherence30: number | null;
  /** Deportistas que registraron al menos una comida en 30 días. */
  logging30: number;
}

export interface GroupBoardDto {
  /** Fecha de referencia (YYYY-MM-DD) de los días sin medir y la adherencia. */
  today: string;
  rows: GroupBoardRowDto[];
  coverage: GroupCoverageDto;
}
