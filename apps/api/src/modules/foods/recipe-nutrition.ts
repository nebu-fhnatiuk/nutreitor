import { foodCatalog, tenantFoods, type RecipeIngredient, type TenantTx } from "@nutreitor/db";
import type { FoodNutrients, RecipeIngredientDto } from "@nutreitor/shared";
import { inArray } from "drizzle-orm";

/**
 * Nutrientes de recetas calculados desde sus ingredientes (ADR 0019). Se resuelven
 * en LOTE (una query al catálogo por slug y una a los propios por id para todas las
 * recetas a la vez). Los propios se leen bajo RLS: uno de otro consultorio no existe.
 *
 * Peso total = suma de los ingredientes (no se modela la pérdida por cocción).
 */
export interface ComputedRecipe {
  ingredients: RecipeIngredientDto[];
  totalGrams: number;
  total: FoodNutrients;
  per100g: FoodNutrients;
  perServing: FoodNutrients;
  missingIngredients: number;
}

type NutrientRow = {
  energyKcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string | null;
  sugarsG: string | null;
  satFatG: string | null;
  sodiumMg: string | null;
  name: string;
  portions: { label: string; grams: number }[];
};

const KEYS = ["energyKcal", "proteinG", "carbsG", "fatG", "fiberG", "sugarsG", "satFatG", "sodiumMg"] as const;
const REQUIRED = new Set(["energyKcal", "proteinG", "carbsG", "fatG"]);
const r1 = (n: number) => Math.round(n * 10) / 10;

export async function computeRecipes(
  tx: TenantTx,
  recipes: { ingredients: RecipeIngredient[]; servings: number }[],
): Promise<ComputedRecipe[]> {
  const slugs = [...new Set(recipes.flatMap((r) => r.ingredients.filter((i) => i.kind === "catalog").map((i) => i.slug)))];
  const ids = [...new Set(recipes.flatMap((r) => r.ingredients.filter((i) => i.kind === "tenant").map((i) => i.id)))];

  const [catalog, own] = await Promise.all([
    slugs.length ? tx.select().from(foodCatalog).where(inArray(foodCatalog.slug, slugs)) : [],
    ids.length ? tx.select().from(tenantFoods).where(inArray(tenantFoods.id, ids)) : [],
  ]);
  const bySlug = new Map<string, NutrientRow>(catalog.map((c) => [c.slug, c]));
  const byId = new Map<string, NutrientRow>(own.map((f) => [f.id, f]));

  return recipes.map((recipe) => {
    const sums: Record<(typeof KEYS)[number], number | null> = Object.fromEntries(
      KEYS.map((k) => [k, REQUIRED.has(k) ? 0 : null]),
    ) as never;
    let totalGrams = 0;
    let missing = 0;
    const ingredients: RecipeIngredientDto[] = recipe.ingredients.map((ing) => {
      const ref = ing.kind === "catalog" ? ing.slug : ing.id;
      const food = ing.kind === "catalog" ? bySlug.get(ing.slug) : byId.get(ing.id);
      totalGrams += ing.grams;
      if (!food) {
        missing++;
        return { kind: ing.kind, ref, grams: ing.grams, name: null, portions: [] };
      }
      const f = ing.grams / 100;
      for (const k of KEYS) {
        const v = food[k];
        if (v === null) continue;
        sums[k] = (sums[k] ?? 0) + Number(v) * f;
      }
      return { kind: ing.kind, ref, grams: ing.grams, name: food.name, portions: food.portions };
    });

    const scale = (factor: number): FoodNutrients => ({
      energyKcal: Math.round((sums.energyKcal ?? 0) * factor),
      proteinG: r1((sums.proteinG ?? 0) * factor),
      carbsG: r1((sums.carbsG ?? 0) * factor),
      fatG: r1((sums.fatG ?? 0) * factor),
      fiberG: sums.fiberG === null ? null : r1(sums.fiberG * factor),
      sugarsG: sums.sugarsG === null ? null : r1(sums.sugarsG * factor),
      satFatG: sums.satFatG === null ? null : r1(sums.satFatG * factor),
      sodiumMg: sums.sodiumMg === null ? null : Math.round(sums.sodiumMg * factor),
    });

    return {
      ingredients,
      totalGrams: r1(totalGrams),
      total: scale(1),
      per100g: totalGrams > 0 ? scale(100 / totalGrams) : scale(0),
      perServing: scale(1 / Math.max(recipe.servings, 1)),
      missingIngredients: missing,
    };
  });
}
