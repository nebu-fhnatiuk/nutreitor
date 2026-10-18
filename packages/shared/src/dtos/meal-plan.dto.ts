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

/**
 * Vínculo del item con un alimento de la base (ADR 0018). Guarda una COPIA de los
 * nutrientes por 100 g sobre los que se calcularon los macros del item: si después
 * se corrige el catálogo, las versiones ya guardadas del plan no cambian, y el
 * editor puede recalcular al cambiar la cantidad sin volver a consultar.
 */
const portionSchema = z.object({
  label: z.string().min(1).max(60),
  grams: z.number().positive().max(2000),
});
const foodRefSchema = z.object({
  source: z.enum(["catalog", "tenant"]),
  id: z.string().uuid(),
  /** Cantidad efectiva en gramos (la que da los macros). */
  grams: z.number().positive().max(5000),
  /** Medida casera elegida, si la cantidad se cargó así ("1 taza" = 160 g × count). */
  portion: portionSchema.optional(),
  count: z.number().positive().max(100).optional(),
  /** Medidas caseras del alimento al vincularlo (para cambiar de unidad en el editor). */
  portions: z.array(portionSchema).max(10).optional(),
  per100g: z.object({
    kcal: z.number().min(0).max(900),
    protein_g: z.number().min(0).max(100),
    carbs_g: z.number().min(0).max(100),
    fat_g: z.number().min(0).max(100),
  }),
  /** Atribución de la fuente del dato ("USDA FoodData Central"); null en propios. */
  attribution: z.string().max(80).nullish(),
});
export type FoodRef = z.infer<typeof foodRefSchema>;

/** Item de una comida. `text` siempre; el resto es enriquecimiento opcional. */
const mealItemSchema = z.object({
  text: z.string().min(1).max(500),
  qty: z.number().min(0).max(100000).optional(),
  unit: z.string().max(30).optional(),
  alternatives: z.array(altSchema).max(20).optional(),
  macros: macrosSchema.optional(),
  note: z.string().max(300).optional(),
  food: foodRefSchema.optional(),
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

// ── Cálculo nutricional (ADR 0018) ───────────────────────────────────────────

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Macros de `grams` de un alimento a partir de sus valores por 100 g. */
export function macrosForGrams(per100g: FoodRef["per100g"], grams: number): Macros {
  const f = grams / 100;
  return {
    protein_g: r1(per100g.protein_g * f),
    carbs_g: r1(per100g.carbs_g * f),
    fat_g: r1(per100g.fat_g * f),
    kcal: Math.round(per100g.kcal * f),
  };
}

/**
 * Suma de macros. Sólo incluye una clave si AL MENOS un sumando la trae (un "C 0"
 * engañoso cuando el dato no se cargó es peor que no mostrarlo). Null si ninguno.
 */
export function sumMacros(list: (Macros | undefined | null)[]): Macros | null {
  const keys = ["protein_g", "carbs_g", "fat_g", "kcal"] as const;
  const acc: Macros = {};
  let any = false;
  for (const m of list) {
    if (!m) continue;
    for (const k of keys) {
      const v = m[k];
      if (v != null) {
        acc[k] = (acc[k] ?? 0) + v;
        any = true;
      }
    }
  }
  if (!any) return null;
  for (const k of keys) if (acc[k] != null) acc[k] = k === "kcal" ? Math.round(acc[k]!) : r1(acc[k]!);
  return acc;
}

/** Totales de un día del plan (todas sus comidas). */
export function dayMacros(day: DayPlan): Macros | null {
  return sumMacros(day.meals.flatMap((m) => m.items.map((it) => it.macros)));
}

/**
 * Desvío de un total contra el objetivo, en % (positivo = se pasa). Null si no hay
 * objetivo o total para esa clave. Sirve para marcar el día en el editor.
 */
export function targetDeviation(total: number | undefined, target: number | undefined): number | null {
  if (total == null || target == null || target <= 0) return null;
  return Math.round(((total - target) / target) * 100);
}

/** Día de la semana del plan para una fecha local (0=domingo en JS → "sun"). */
export function weekdayOf(date: Date): Weekday {
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[date.getDay()]!;
}

/**
 * Comidas que corresponden a una fecha: en un plan de día-tipo, siempre las mismas;
 * en uno semanal, las del día de la semana (vacío si ese día no se cargó). Es lo
 * que el portal muestra como "lo que te toca hoy".
 */
export function mealsForDate(body: MealPlanBody, date: Date): PlanMeal[] {
  if (body.layout === "day") return body.day.meals;
  return body.days[weekdayOf(date)]?.meals ?? [];
}

/**
 * Cuántos items de un día traen kcal. Si no son todos, el total es PARCIAL: sumar
 * sólo lo cargado y mostrarlo como "el total del día" informa mal (un plan con un
 * solo item con macros decía "250 kcal en el día" y "−87 %" contra el objetivo).
 */
export function macroCoverage(day: DayPlan): { items: number; withKcal: number; complete: boolean } {
  const items = day.meals.flatMap((m) => m.items);
  const withKcal = items.filter((it) => it.macros?.kcal != null).length;
  return { items: items.length, withKcal, complete: items.length > 0 && withKcal === items.length };
}
