import { z } from "zod";

import { activityKeys, reeFormulas, type EnergyResults, type EnergySex } from "../energy.js";

/**
 * Requerimiento energético (ADR 0032). Se guardan las ENTRADAS (con el peso, la talla
 * y la masa libre de grasa usados, para que la prescripción sea reproducible); los
 * resultados se calculan al leer. Cada guardado es una versión nueva.
 */
const weekdayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const sessionSchema = z.object({
  activity: z.enum([...activityKeys, "custom"]),
  met: z.number().min(1).max(20).nullish(),
  label: z.string().trim().max(60).nullish(),
  minutes: z.number().int().min(1).max(600),
});

const dayTypeSchema = z.object({
  id: z.string().min(1).max(20),
  name: z.string().trim().min(1, "Poné un nombre al tipo de día.").max(40),
  sessions: z.array(sessionSchema).max(6),
  choGPerKg: z.number().min(0).max(15),
  proGPerKg: z.number().min(0).max(4),
});

export const saveEnergySchema = z
  .object({
    formula: z.enum(reeFormulas),
    activityFactor: z.number().min(1).max(2.5),
    adjustmentPct: z.number().min(-40).max(40),
    weightKg: z.number().min(15).max(250),
    heightCm: z.number().min(80).max(230).nullish(),
    ffmKg: z.number().min(10).max(150).nullish(),
    dayTypes: z.array(dayTypeSchema).min(1).max(7),
    week: z.record(z.enum(weekdayKeys), z.string().max(20)).default({}),
    note: z.string().trim().max(1000).nullish(),
  })
  .superRefine((v, ctx) => {
    const ids = new Set<string>();
    v.dayTypes.forEach((d, i) => {
      if (ids.has(d.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dayTypes", i, "id"], message: "Tipo de día repetido." });
      ids.add(d.id);
      d.sessions.forEach((s, j) => {
        if (s.activity === "custom" && s.met == null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dayTypes", i, "sessions", j, "met"], message: "Una actividad propia necesita su MET." });
        }
      });
    });
    for (const [day, id] of Object.entries(v.week)) {
      if (!ids.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["week", day], message: "La semana usa un tipo de día que no existe." });
    }
    if (v.ffmKg != null && v.ffmKg >= v.weightKg) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ffmKg"], message: "La masa libre de grasa tiene que ser menor que el peso." });
    }
  });
export type SaveEnergyDto = z.infer<typeof saveEnergySchema>;

export interface EnergyRequirementDto extends SaveEnergyDto {
  id: string;
  patientId: string;
  createdByName: string | null;
  createdAt: string;
  /** Sexo y edad de la ficha a la fecha de la versión. */
  sex: EnergySex | null;
  ageYears: number | null;
  results: EnergyResults;
}

/** De dónde sale un dato sugerido. */
export interface SourcedValue {
  value: number;
  source: "anthropometry" | "metric" | "record";
  /** Fecha de la medición (YYYY-MM-DD), si viene de una. */
  date: string | null;
}

/** Datos de la ficha y las mediciones para precargar un requerimiento nuevo. */
export interface EnergyContextDto {
  sex: EnergySex | null;
  ageYears: number | null;
  weightKg: SourcedValue | null;
  heightCm: SourcedValue | null;
  /** Peso × (1 − % graso) de la última antropometría (Durnin-Womersley, si no Yuhasz). */
  ffmKg: SourcedValue | null;
}
