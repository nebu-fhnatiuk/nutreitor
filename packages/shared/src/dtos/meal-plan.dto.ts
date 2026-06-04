import { z } from "zod";

/**
 * Documento del plan alimentario, flexible por ESTILO de trabajo del profesional.
 * Dos ejes que se combinan:
 *  - layout: día-tipo repetible (`day`) o plantilla semanal (`week`, lun-dom).
 *  - detalle: todo OPCIONAL y ortogonal. El cualitativo escribe sólo `text`; el
 *    que trabaja fino agrega cantidad, alternativas/intercambios y macros.
 *
 * Macros: se cargan a nivel item (opcional). Los totales por comida/día se DERIVAN
 * en la UI (única fuente = items, sin drift). `targets` (objetivo del plan) sí se
 * guarda: es input del profesional, no un derivado.
 */

/** Macros opcionales (P/C/G + kcal). Cada uno opcional. */
const macrosSchema = z.object({
  protein_g: z.number().min(0).max(2000).optional(),
  carbs_g: z.number().min(0).max(2000).optional(),
  fat_g: z.number().min(0).max(2000).optional(),
  kcal: z.number().min(0).max(20000).optional(),
});
export type Macros = z.infer<typeof macrosSchema>;

/** Alternativa/intercambio de un item (mismo lugar en la comida). */
const altSchema = z.object({
  text: z.string().min(1).max(500),
  qty: z.number().min(0).max(100000).optional(),
  unit: z.string().max(30).optional(),
});

/** Item de una comida. `text` siempre; el resto es enriquecimiento opcional. */
const mealItemSchema = z.object({
  text: z.string().min(1).max(500),
  qty: z.number().min(0).max(100000).optional(),
  unit: z.string().max(30).optional(),
  alternatives: z.array(altSchema).max(20).optional(),
  macros: macrosSchema.optional(),
  note: z.string().max(300).optional(),
});
const planMealSchema = z.object({
  name: z.string().min(1).max(120),
  time: z.string().max(20).optional(),
  items: z.array(mealItemSchema).max(50),
});
const dayPlanSchema = z.object({
  meals: z.array(planMealSchema).max(20),
});

/** Días de la semana (orden de render del layout `week`). */
export const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof weekdays)[number];

const dayLayoutSchema = z.object({
  layout: z.literal("day"),
  day: dayPlanSchema,
  targets: macrosSchema.optional(),
  generalNotes: z.string().max(4000).optional(),
});
const weekLayoutSchema = z.object({
  layout: z.literal("week"),
  // Parcial: no es obligatorio cargar los 7 días.
  days: z.record(z.enum(weekdays), dayPlanSchema),
  targets: macrosSchema.optional(),
  generalNotes: z.string().max(4000).optional(),
});

export const mealPlanBodySchema = z.discriminatedUnion("layout", [
  dayLayoutSchema,
  weekLayoutSchema,
]);

export type MealItem = z.infer<typeof mealItemSchema>;
export type MealAlternative = z.infer<typeof altSchema>;
export type PlanMeal = z.infer<typeof planMealSchema>;
export type DayPlan = z.infer<typeof dayPlanSchema>;
export type MealPlanBody = z.infer<typeof mealPlanBodySchema>;

/**
 * Normaliza un body legacy (`{ meals, generalNotes }`, sin `layout`, anterior a la
 * estructura multi-estilo) a `layout: "day"`. Idempotente: un body ya nuevo pasa
 * tal cual. Defensa para filas no migradas y para input legacy.
 */
export function normalizeMealPlanBody(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "layout" in raw) {
    return raw; // ya tiene shape nuevo (day|week): pasa tal cual.
  }
  if (raw && typeof raw === "object" && "meals" in raw) {
    const o = raw as { meals?: unknown; generalNotes?: unknown };
    return {
      layout: "day",
      day: { meals: Array.isArray(o.meals) ? o.meals : [] },
      ...(o.generalNotes != null ? { generalNotes: o.generalNotes } : {}),
    };
  }
  // Degenerado (null, {}, forma inesperada): día vacío. Restaura el blindaje
  // incondicional que daba el viejo `{ meals: row.body?.meals ?? [] }`.
  return { layout: "day", day: { meals: [] } };
}

/** Guardar un plan: crea una NUEVA versión activa (supersede la anterior). */
export const savePlanSchema = z.object({
  title: z.string().min(1).max(200),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha esperada YYYY-MM-DD")
    .nullish(),
  // Acepta body nuevo o legacy (normaliza antes de validar la union).
  body: z.preprocess(normalizeMealPlanBody, mealPlanBodySchema),
});
export type SavePlanDto = z.infer<typeof savePlanSchema>;

export type MealPlanStatus = "active" | "superseded" | "archived";

export interface MealPlanDto {
  id: string;
  version: number;
  status: MealPlanStatus;
  title: string;
  startDate: string | null;
  body: MealPlanBody;
  authorMembershipId: string;
  authorName: string;
  createdAt: string;
}
