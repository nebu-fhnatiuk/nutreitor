/**
 * Compilación del catálogo de alimentos (ADR 0018): curación AR + nutrientes de USDA
 * FoodData Central SR Legacy → migración SQL con upserts por `slug`.
 *
 * Lógica pura (sin I/O) para poder testearla sin el dataset; el script
 * `scripts/build-food-catalog.ts` lee los CSV y escribe el archivo.
 */

export interface CuratedFood {
  slug: string;
  name: string;
  group: string;
  /** Descripción EXACTA del alimento en SR Legacy. */
  usda: string;
  portions: { label: string; grams: number }[];
}

/** Nutrientes de SR Legacy que van a columnas (id de nutriente en FDC → columna). */
export const CORE_NUTRIENTS = {
  energyKcal: { id: 1008, name: "Energy", unit: "KCAL", required: true },
  proteinG: { id: 1003, name: "Protein", unit: "G", required: true },
  fatG: { id: 1004, name: "Total lipid (fat)", unit: "G", required: true },
  carbsG: { id: 1005, name: "Carbohydrate, by difference", unit: "G", required: true },
  fiberG: { id: 1079, name: "Fiber, total dietary", unit: "G", required: false },
  sugarsG: { id: 2000, name: "Sugars, Total", unit: "G", required: false },
  satFatG: { id: 1258, name: "Fatty acids, total saturated", unit: "G", required: false },
  sodiumMg: { id: 1093, name: "Sodium, Na", unit: "MG", required: false },
} as const;

/** Micronutrientes que van a `extra` (clave estable → id FDC). */
export const EXTRA_NUTRIENTS = {
  calcium_mg: 1087,
  iron_mg: 1089,
  potassium_mg: 1092,
  vitamin_c_mg: 1162,
} as const;

export type CoreKey = keyof typeof CORE_NUTRIENTS;

export interface CatalogRow {
  slug: string;
  name: string;
  group: string;
  fdcId: string;
  core: Record<CoreKey, number | null>;
  extra: Record<string, number>;
  portions: { label: string; grams: number }[];
}

export interface BuildResult {
  rows: CatalogRow[];
  /** Curados sin match exacto, con las descripciones más parecidas como pista. */
  unmatched: { slug: string; usda: string; suggestions: string[] }[];
  /** Curados con match pero sin algún nutriente obligatorio. */
  incomplete: { slug: string; missing: string[] }[];
}

/**
 * @param foods descripción → fdc_id (SR Legacy)
 * @param nutrients fdc_id → (nutrient_id → amount por 100 g)
 */
export function buildCatalog(
  curated: CuratedFood[],
  foods: Map<string, string>,
  nutrients: Map<string, Map<number, number>>,
): BuildResult {
  const rows: CatalogRow[] = [];
  const unmatched: BuildResult["unmatched"] = [];
  const incomplete: BuildResult["incomplete"] = [];
  const slugs = new Set<string>();

  for (const c of curated) {
    if (slugs.has(c.slug)) throw new Error(`slug duplicado en la curación: ${c.slug}`);
    slugs.add(c.slug);

    const fdcId = foods.get(c.usda);
    if (!fdcId) {
      unmatched.push({ slug: c.slug, usda: c.usda, suggestions: suggest(c.usda, foods.keys()) });
      continue;
    }
    const values = nutrients.get(fdcId) ?? new Map<number, number>();
    const core = {} as Record<CoreKey, number | null>;
    const missing: string[] = [];
    for (const [key, def] of Object.entries(CORE_NUTRIENTS) as [CoreKey, (typeof CORE_NUTRIENTS)[CoreKey]][]) {
      const v = values.get(def.id);
      core[key] = v ?? null;
      if (v === undefined && def.required) missing.push(def.name);
    }
    if (missing.length) {
      incomplete.push({ slug: c.slug, missing });
      continue;
    }
    const extra: Record<string, number> = {};
    for (const [key, id] of Object.entries(EXTRA_NUTRIENTS)) {
      const v = values.get(id);
      if (v !== undefined) extra[key] = v;
    }
    rows.push({
      slug: c.slug,
      name: c.name,
      group: c.group,
      fdcId,
      core,
      extra,
      portions: c.portions,
    });
  }
  return { rows, unmatched, incomplete };
}

/** Las 3 descripciones con más palabras en común (pista para corregir la curación). */
function suggest(target: string, candidates: Iterable<string>): string[] {
  const words = tokens(target);
  return [...candidates]
    .map((d) => ({ d, score: [...tokens(d)].filter((w) => words.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.d.length - b.d.length)
    .slice(0, 3)
    .map((x) => x.d);
}

function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9%]+/).filter((w) => w.length > 2));
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const num = (v: number | null) => (v === null ? "NULL" : String(Math.round(v * 100) / 100));

/** Migración SQL idempotente: upsert por slug, conservando la atribución a USDA. */
export function toSql(rows: CatalogRow[], header: string): string {
  const cols =
    "slug, name, food_group, source, source_ref, energy_kcal, protein_g, carbs_g, fat_g, " +
    "fiber_g, sugars_g, sat_fat_g, sodium_mg, portions, extra";
  const values = rows.map(
    (r) =>
      `  (${[
        q(r.slug),
        q(r.name),
        q(r.group),
        q("usda"),
        q(r.fdcId),
        num(r.core.energyKcal),
        num(r.core.proteinG),
        num(r.core.carbsG),
        num(r.core.fatG),
        num(r.core.fiberG),
        num(r.core.sugarsG),
        num(r.core.satFatG),
        num(r.core.sodiumMg),
        `${q(JSON.stringify(r.portions))}::jsonb`,
        `${q(JSON.stringify(r.extra))}::jsonb`,
      ].join(", ")})`,
  );
  const update = cols
    .split(", ")
    .filter((c) => c !== "slug")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(",\n  ");
  return `${header}
INSERT INTO food_catalog (${cols}) VALUES
${values.join(",\n")}
ON CONFLICT (slug) DO UPDATE SET
  ${update},
  updated_at = now();
`;
}
