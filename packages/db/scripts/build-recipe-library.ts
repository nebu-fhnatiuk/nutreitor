/**
 * Genera la migración del recetario global (ADR 0019) desde la curación.
 *
 *   pnpm --filter @nutreitor/db recipes:build [salida.sql]
 *
 * Falla si un ingrediente usa un slug que no existe en la curación del catálogo
 * (foods-ar.curation.json): una receta de la biblioteca sólo puede usar el catálogo.
 * No incluye nutrientes: se calculan al servir la receta.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface CuratedRecipe {
  slug: string;
  name: string;
  category: string;
  servings: number;
  ingredients: { slug: string; grams: number }[];
  steps?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, "..", "migrations", "0029_recipe_library_data.sql");
const catalog = new Set(
  (JSON.parse(readFileSync(join(here, "..", "catalog", "foods-ar.curation.json"), "utf8")) as {
    foods: { slug: string }[];
  }).foods.map((f) => f.slug),
);
const { recipes } = JSON.parse(
  readFileSync(join(here, "..", "catalog", "recipes-ar.curation.json"), "utf8"),
) as { recipes: CuratedRecipe[] };

const errors: string[] = [];
const seen = new Set<string>();
for (const r of recipes) {
  if (seen.has(r.slug)) errors.push(`slug duplicado: ${r.slug}`);
  seen.add(r.slug);
  if (!Number.isInteger(r.servings) || r.servings < 1 || r.servings > 50) errors.push(`${r.slug}: porciones inválidas`);
  if (!r.ingredients.length) errors.push(`${r.slug}: sin ingredientes`);
  for (const i of r.ingredients) {
    if (!catalog.has(i.slug)) errors.push(`${r.slug}: el ingrediente "${i.slug}" no está en el catálogo`);
    if (!(i.grams > 0)) errors.push(`${r.slug}: gramos inválidos en "${i.slug}"`);
  }
}
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const values = recipes.map((r) => {
  const ingredients = r.ingredients.map((i) => ({ kind: "catalog", slug: i.slug, grams: i.grams }));
  return `  (${[q(r.slug), q(r.name), q(r.category), String(r.servings), `${q(JSON.stringify(ingredients))}::jsonb`, r.steps ? q(r.steps) : "NULL"].join(", ")})`;
});

writeFileSync(
  out,
  `-- ─────────────────────────────────────────────────────────────────────────────
-- GENERADO por packages/db/scripts/build-recipe-library.ts — no editar a mano.
-- Recetario de referencia (ADR 0019): ${recipes.length} recetas. BORRADOR a validar con
-- criterio profesional. Ingredientes del catálogo por slug; nutrientes calculados.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO recipe_library (slug, name, category, servings, ingredients, steps) VALUES
${values.join(",\n")}
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  servings = EXCLUDED.servings,
  ingredients = EXCLUDED.ingredients,
  steps = EXCLUDED.steps,
  updated_at = now();
`,
);
console.log(`✓ ${recipes.length} recetas → ${out}`);
