import { z } from "zod";

import type { FoodNutrients } from "./food.dto.js";

/**
 * Recetas (ADR 0019). Un ingrediente es del catálogo (por `slug`, estable entre
 * bases) o un alimento propio del consultorio (por `id`). Los nutrientes no se
 * guardan: se calculan al servir la receta.
 */
export const recipeIngredientSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("catalog"), slug: z.string().min(1).max(80), grams: z.number().positive().max(5000) }),
  z.object({ kind: z.literal("tenant"), id: z.string().uuid(), grams: z.number().positive().max(5000) }),
]);
export type RecipeIngredientInput = z.infer<typeof recipeIngredientSchema>;

/** Alta / edición de una receta del consultorio. */
export const tenantRecipeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  servings: z.number().int().min(1).max(50),
  ingredients: z.array(recipeIngredientSchema).min(1).max(40),
  steps: z.string().trim().max(4000).nullish(),
});
export type TenantRecipeDto = z.infer<typeof tenantRecipeSchema>;

export interface RecipeIngredientDto {
  kind: "catalog" | "tenant";
  /** slug (catálogo) o id (propio). */
  ref: string;
  grams: number;
  /** Nombre resuelto; null si el ingrediente ya no existe. */
  name: string | null;
  /** Grupo del alimento (góndola), null si no existe. */
  group: string | null;
  /** Medidas caseras del ingrediente (para el editor de la receta). */
  portions: { label: string; grams: number }[];
  /** Valores por 100 g (para recalcular en vivo en el editor); null si no existe. */
  per100g: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } | null;
}

export interface RecipeDto {
  id: string;
  source: "recipe" | "library";
  name: string;
  category: string;
  servings: number;
  steps: string | null;
  ingredients: RecipeIngredientDto[];
  totalGrams: number;
  /** Nutrientes de la receta entera, por 100 g y por porción. */
  total: FoodNutrients;
  per100g: FoodNutrients;
  perServing: FoodNutrients;
  /** Ingredientes que ya no existen (alimento propio archivado, slug borrado). */
  missingIngredients: number;
  archived: boolean;
}
