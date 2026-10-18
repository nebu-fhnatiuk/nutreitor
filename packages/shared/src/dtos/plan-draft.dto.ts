import { z } from "zod";

import type { FoodDto } from "./food.dto.js";
import { foodRefFor, macrosForGrams, macrosSchema, type MealItem, type MealPlanBody, type PlanMeal } from "./meal-plan.dto.js";

/**
 * Borrador de plan armado por NUTRI (Fase 4.3, ADR 0020). El agente PROPONE
 * alimentos del catálogo por `slug` y gramos; la API resuelve contra el catálogo y
 * calcula los macros: el modelo nunca escribe valores nutricionales. El resultado
 * se abre en el editor SIN guardar: lo revisa y lo guarda el profesional.
 */
export const planDraftRequestSchema = z.object({
  patientId: z.string().uuid(),
  /** Objetivo del editor; si falta, se usa el del plan activo. */
  targets: macrosSchema.optional(),
  instructions: z.string().trim().max(1000).optional(),
});
export type PlanDraftRequestDto = z.infer<typeof planDraftRequestSchema>;

/** Lo que devuelve el servicio de agentes (se valida: es salida de un modelo). */
export const planDraftProposalSchema = z.object({
  meals: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        time: z.string().max(20).optional(),
        items: z
          .array(
            z.object({
              slug: z.string().min(1).max(80),
              grams: z.number().positive().max(2000),
              note: z.string().max(300).optional(),
            }),
          )
          .max(15),
      }),
    )
    .min(1)
    .max(8),
  notes: z.string().max(2000).default(""),
});
export type PlanDraftProposal = z.infer<typeof planDraftProposalSchema>;

export interface PlanDraftDto {
  conversationId: string;
  model: string;
  body: MealPlanBody;
  notes: string;
  /** Slugs propuestos que no existen en el catálogo (se descartan). */
  unresolved: string[];
}

/** Arma el cuerpo del plan (día tipo) desde la propuesta, con items vinculados. */
export function resolvePlanDraft(
  proposal: PlanDraftProposal,
  catalog: Map<string, FoodDto>,
  targets?: MealPlanBody["targets"],
): { body: MealPlanBody; unresolved: string[] } {
  const unresolved = new Set<string>();
  const meals: PlanMeal[] = proposal.meals.map((m) => ({
    name: m.name,
    ...(m.time ? { time: m.time } : {}),
    items: m.items.flatMap((it): MealItem[] => {
      const food = catalog.get(it.slug);
      if (!food) {
        unresolved.add(it.slug);
        return [];
      }
      const grams = Math.round(it.grams);
      const ref = foodRefFor(food, grams);
      return [
        {
          text: food.name,
          qty: grams,
          unit: "g",
          macros: macrosForGrams(ref.per100g, grams),
          food: ref,
          ...(it.note ? { note: it.note } : {}),
        },
      ];
    }),
  }));
  return {
    body: {
      layout: "day",
      day: { meals: meals.filter((m) => m.items.length) },
      ...(targets ? { targets } : {}),
    },
    unresolved: [...unresolved],
  };
}
