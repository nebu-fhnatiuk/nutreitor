import { z } from "zod";

import type { SweatTestResults } from "../hydration.js";

/**
 * Prueba de sudoración (ADR 0036). Se guardan las mediciones; los resultados y el plan
 * de líquidos se calculan al leer (`sweatTestResults`).
 */
const session = {
  measuredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha esperada YYYY-MM-DD"),
  sessionLabel: z.string().trim().max(60).nullish(),
  durationMin: z.number().int().min(10, "La sesión tiene que durar al menos 10 minutos.").max(600),
  temperatureC: z.number().min(-20).max(55).nullish(),
  humidityPct: z.number().int().min(0).max(100).nullish(),
};

const athlete = {
  preWeightKg: z.number().min(20).max(250),
  postWeightKg: z.number().min(20).max(250),
  fluidIntakeMl: z.number().int().min(0).max(15000),
  urineMl: z.number().int().min(0).max(5000).default(0),
};

/** Diferencia de más de 5 kg entre antes y después: casi seguro un error de tipeo. */
const plausible = (v: { preWeightKg: number; postWeightKg: number }) => Math.abs(v.preWeightKg - v.postWeightKg) <= 5;
const plausibleMsg = { message: "Entre el peso antes y después hay más de 5 kg: revisá los valores.", path: ["postWeightKg"] };

export const saveSweatTestSchema = z
  .object({ ...session, ...athlete, note: z.string().trim().max(1000).nullish() })
  .refine(plausible, plausibleMsg);
export type SaveSweatTestDto = z.infer<typeof saveSweatTestSchema>;

/** Máximo de deportistas por carga de plantel (mismo tope que la antropometría). */
export const GROUP_SWEAT_MAX = 60;

export const saveGroupSweatTestSchema = z.object({
  ...session,
  entries: z
    .array(z.object({ patientId: z.string().uuid(), ...athlete }).refine(plausible, plausibleMsg))
    .min(1, "No hay mediciones para guardar.")
    .max(GROUP_SWEAT_MAX)
    .refine((e) => new Set(e.map((x) => x.patientId)).size === e.length, "Un deportista aparece dos veces."),
});
export type SaveGroupSweatTestDto = z.infer<typeof saveGroupSweatTestSchema>;

export interface SweatTestDto {
  id: string;
  patientId: string;
  groupId: string | null;
  measuredOn: string;
  sessionLabel: string | null;
  durationMin: number;
  temperatureC: number | null;
  humidityPct: number | null;
  preWeightKg: number;
  postWeightKg: number;
  fluidIntakeMl: number;
  urineMl: number;
  note: string | null;
  recordedByName: string | null;
  createdAt: string;
  results: SweatTestResults;
}

/** Fila del resumen del plantel: la última prueba de cada deportista. */
export interface GroupSweatRowDto {
  patientId: string;
  fullName: string;
  last: SweatTestDto | null;
}
