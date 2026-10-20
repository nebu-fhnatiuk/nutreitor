import { z } from "zod";

import { dayMacros, planMealSchema, type Macros, type PlanMeal } from "./meal-plan.dto.js";

/**
 * Recordatorio de 24 h (ADR 0033): lo que el deportista comió y tomó un día, cargado
 * por el profesional en la consulta (método de pasadas múltiples). Las comidas tienen
 * la misma forma que las del plan, con los items vinculados a la base de alimentos;
 * los totales se derivan al leer.
 */
export const saveRecallSchema = z.object({
  recalledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha esperada YYYY-MM-DD"),
  /** ¿Fue un día habitual? Un día atípico (cumpleaños, viaje) no describe la dieta. */
  typical: z.boolean(),
  /** Tipo de día ("Entrenamiento", "Partido"…), para comparar contra el requerimiento. */
  dayLabel: z.string().trim().max(40).nullish(),
  meals: z.array(planMealSchema).min(1, "Cargá al menos una comida.").max(15),
  note: z.string().trim().max(1000).nullish(),
});
export type SaveRecallDto = z.infer<typeof saveRecallSchema>;

export interface RecallTotals {
  /** Suma de los items con macros. */
  macros: Macros | null;
  items: number;
  /** Items sin macros (texto libre sin vínculo a la base): el total queda parcial. */
  itemsWithoutMacros: number;
  /** kcal por comida, en el orden cargado. */
  byMeal: { name: string; kcal: number | null }[];
}

export function recallTotals(meals: PlanMeal[]): RecallTotals {
  const items = meals.flatMap((m) => m.items);
  return {
    macros: dayMacros({ meals }),
    items: items.length,
    itemsWithoutMacros: items.filter((it) => it.macros?.kcal == null).length,
    byMeal: meals.map((m) => ({ name: m.name, kcal: dayMacros({ meals: [m] })?.kcal ?? null })),
  };
}

export interface RecallDto extends SaveRecallDto {
  id: string;
  patientId: string;
  recordedByName: string | null;
  createdAt: string;
  totals: RecallTotals;
}
