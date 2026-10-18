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
  /** Sólo en el catálogo: clave estable entre bases (las recetas la usan, ADR 0019). */
  slug?: string;
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
  recipe?: {
    servings: number;
    totalGrams: number;
    missingIngredients: number;
    /** Desglose por cada 100 g de receta (la lista de compras lo expande). */
    ingredients: { name: string; group: string; gramsPer100g: number }[];
  };
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

// ── Intercambios (Fase 4.2) ──────────────────────────────────────────────────

export interface FoodSwapDto {
  food: FoodDto;
  /** Gramos del candidato que dan las mismas kcal que el original. */
  grams: number;
  /** Diferencia de macros respecto del original, en gramos (candidato − original). */
  delta: { proteinG: number; carbsG: number; fatG: number };
}

/**
 * Intercambios por equivalencia calculada: candidatos del MISMO grupo con la
 * cantidad ajustada para dar las mismas kcal que `grams` del original. Ordena por
 * parecido del reparto de macros (% de energía de P/C/G), así "arroz → fideos" va
 * antes que "arroz → pan con manteca". Descarta cantidades poco realistas (menos de
 * 5 g o más de 3× la original) y candidatos sin energía.
 */
export function equivalentSwaps(
  original: FoodDto,
  grams: number,
  candidates: FoodDto[],
  limit = 8,
): FoodSwapDto[] {
  const kcal = (original.per100g.energyKcal * grams) / 100;
  if (kcal <= 0) return [];
  const share = (f: FoodDto) => {
    const p = f.per100g.proteinG * 4;
    const c = f.per100g.carbsG * 4;
    const g = f.per100g.fatG * 9;
    const t = p + c + g || 1;
    return [p / t, c / t, g / t] as const;
  };
  const target = share(original);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return candidates
    .filter((c) => !(c.source === original.source && c.id === original.id) && c.per100g.energyKcal > 0)
    .map((c) => {
      const g = Math.round((kcal / c.per100g.energyKcal) * 100);
      const s = share(c);
      const distance = Math.abs(s[0] - target[0]) + Math.abs(s[1] - target[1]) + Math.abs(s[2] - target[2]);
      return {
        food: c,
        grams: g,
        distance,
        delta: {
          proteinG: r1((c.per100g.proteinG * g) / 100 - (original.per100g.proteinG * grams) / 100),
          carbsG: r1((c.per100g.carbsG * g) / 100 - (original.per100g.carbsG * grams) / 100),
          fatG: r1((c.per100g.fatG * g) / 100 - (original.per100g.fatG * grams) / 100),
        },
      };
    })
    .filter((x) => x.grams >= 5 && x.grams <= grams * 3)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ food, grams: g, delta }) => ({ food, grams: g, delta }));
}
