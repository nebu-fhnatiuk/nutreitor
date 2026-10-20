import { z } from "zod";

import {
  ffqFrequencyKeys,
  ffqItemKeys,
  type FfqAnswers,
  type FfqItemKey,
  type FfqItemResult,
  type FfqRuleResult,
} from "../food-frequency.js";

/** Cuestionario de frecuencia de consumo (ADR 0034). Se guardan las respuestas; los resultados se calculan al leer. */
const answerSchema = z.object({
  frequency: z.enum(ffqFrequencyKeys),
  portions: z.number().min(0.25).max(20),
});

export const saveFoodFrequencySchema = z.object({
  answeredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha esperada YYYY-MM-DD"),
  answers: z
    .object(Object.fromEntries(ffqItemKeys.map((k) => [k, answerSchema.optional()])) as Record<FfqItemKey, z.ZodOptional<typeof answerSchema>>)
    .strict()
    .refine((a) => Object.values(a).some(Boolean), "Contestá al menos un grupo."),
  note: z.string().trim().max(1000).nullish(),
});
export type SaveFoodFrequencyDto = z.infer<typeof saveFoodFrequencySchema>;

export interface FoodFrequencyDto {
  id: string;
  patientId: string;
  answeredOn: string;
  answers: FfqAnswers;
  note: string | null;
  recordedByName: string | null;
  createdAt: string;
  items: FfqItemResult[];
  gapa: FfqRuleResult[];
  /** % de integrales sobre el total de cereales, si contestó alguno. */
  wholeGrainPct: number | null;
}
