import { z } from "zod";

import type { AnthroResults } from "../anthropometry.js";
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
