import { z } from "zod";

/**
 * Base de alimentos (ADR 0018). Dos orígenes con la misma forma: el catálogo de
 * referencia global (`catalog`, sólo lectura) y los alimentos propios del
 * consultorio (`tenant`). Todos los nutrientes son por 100 g de porción comestible.
 */
/** catalog/tenant: alimentos (ADR 0018). recipe/library: recetas del consultorio y
 * de la biblioteca global, servidas con la misma forma (ADR 0019). */
export const foodSources = ["catalog", "tenant", "recipe", "library"] as const;
export type FoodSource = (typeof foodSources)[number];

/** Medida casera: "1 taza" = 160 g. */
export const foodPortionSchema = z.object({
  label: z.string().trim().min(1).max(60),
  grams: z.number().positive().max(2000),
});
export type FoodPortion = z.infer<typeof foodPortionSchema>;

export interface FoodNutrients {
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarsG: number | null;
  satFatG: number | null;
  sodiumMg: number | null;
}

export interface FoodDto {
  /** Referencia estable para el plan: `source` + `id`. */
  id: string;
  source: FoodSource;
  name: string;
  group: string;
  /** Por 100 g. */
  per100g: FoodNutrients;
  portions: FoodPortion[];
  /** Micronutrientes opcionales por 100 g (clave → valor). */
  extra: Record<string, number>;
  /** Atribución de la fuente del dato (catálogo: "usda"). Null en los propios. */
  attribution: string | null;
  archived: boolean;
  /** Sólo en recetas: rinde, peso total e ingredientes que ya no existen. */
  recipe?: { servings: number; totalGrams: number; missingIngredients: number };
}

const grams = z.number().min(0).max(100);
const kcal = z.number().min(0).max(900);

/** Alta / edición de un alimento propio del consultorio (valores por 100 g). */
export const tenantFoodSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    group: z.string().trim().min(1).max(60),
    energyKcal: kcal,
    proteinG: grams,
    carbsG: grams,
    fatG: grams,
    fiberG: grams.nullish(),
    sugarsG: grams.nullish(),
    satFatG: grams.nullish(),
    sodiumMg: z.number().min(0).max(40000).nullish(),
    portions: z.array(foodPortionSchema).max(10).default([]),
  })
  // Por 100 g, los macros no pueden sumar más que el peso.
  .refine((f) => f.proteinG + f.carbsG + f.fatG <= 100, {
    message: "Proteínas + carbohidratos + grasas no pueden superar 100 g cada 100 g.",
  });
export type TenantFoodInput = z.input<typeof tenantFoodSchema>;
export type TenantFoodDto = z.output<typeof tenantFoodSchema>;

/** Búsqueda del editor del plan. */
export const foodSearchSchema = z.object({
  q: z.string().trim().min(2).max(60),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type FoodSearchQuery = z.infer<typeof foodSearchSchema>;
