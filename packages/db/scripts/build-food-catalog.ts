/**
 * Genera la migración del catálogo de alimentos desde USDA SR Legacy (ADR 0018).
 *
 *   pnpm --filter @nutreitor/db catalog:build <dir-de-SR-Legacy-CSV> [salida.sql]
 *
 * El directorio es el CSV de "SR Legacy" descargado de
 * https://fdc.nal.usda.gov/download-datasets (food.csv, food_nutrient.csv,
 * nutrient.csv). Falla si alguna descripción curada no existe en el dataset (con
 * sugerencias) o si a un alimento le falta un nutriente obligatorio.
 */
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import {
  buildCatalog,
  CORE_NUTRIENTS,
  EXTRA_NUTRIENTS,
  toSql,
  type CuratedFood,
} from "../src/catalog/build-food-catalog.js";

const here = dirname(fileURLToPath(import.meta.url));
const [srDir, outArg] = process.argv.slice(2);
if (!srDir) {
  console.error("Uso: build-food-catalog <dir-SR-Legacy-CSV> [salida.sql]");
  process.exit(1);
}
const out = outArg ?? join(here, "..", "migrations", "0027_food_catalog_data.sql");

/** Parser CSV mínimo (RFC 4180, sin saltos de línea dentro de campos). */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else cur += ch;
  }
  fields.push(cur);
  return fields;
}

async function readCsv(file: string, onRow: (row: Record<string, string>) => void) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const line of rl) {
    if (!line) continue;
    const fields = parseLine(line);
    if (!header) {
      header = fields;
      continue;
    }
    onRow(Object.fromEntries(header.map((h, i) => [h, fields[i] ?? ""])));
  }
}

async function main() {
  const curation = JSON.parse(
    readFileSync(join(here, "..", "catalog", "foods-ar.curation.json"), "utf8"),
  ) as { foods: CuratedFood[] };

  // Verificación: los ids de nutriente que usamos significan lo que creemos.
  const names = new Map<number, string>();
  await readCsv(join(srDir!, "nutrient.csv"), (r) => names.set(Number(r.id), r.name ?? ""));
  for (const def of Object.values(CORE_NUTRIENTS)) {
    if (names.get(def.id) !== def.name) {
      throw new Error(`nutrient ${def.id}: esperaba "${def.name}", el dataset dice "${names.get(def.id)}"`);
    }
  }

  const foods = new Map<string, string>(); // descripción → fdc_id
  await readCsv(join(srDir!, "food.csv"), (r) => foods.set(r.description!, r.fdc_id!));

  const wanted = new Set(curation.foods.map((c) => foods.get(c.usda)).filter(Boolean));
  const ids = new Set<number>([
    ...Object.values(CORE_NUTRIENTS).map((d) => d.id),
    ...Object.values(EXTRA_NUTRIENTS),
  ]);
  const nutrients = new Map<string, Map<number, number>>();
  await readCsv(join(srDir!, "food_nutrient.csv"), (r) => {
    if (!wanted.has(r.fdc_id!)) return;
    const nid = Number(r.nutrient_id);
    if (!ids.has(nid)) return;
    if (!nutrients.has(r.fdc_id!)) nutrients.set(r.fdc_id!, new Map());
    nutrients.get(r.fdc_id!)!.set(nid, Number(r.amount));
  });

  const result = buildCatalog(curation.foods, foods, nutrients);
  if (result.unmatched.length || result.incomplete.length) {
    for (const u of result.unmatched) {
      console.error(`✗ ${u.slug}: no existe "${u.usda}"`);
      for (const s of u.suggestions) console.error(`    ¿"${s}"?`);
    }
    for (const i of result.incomplete) console.error(`✗ ${i.slug}: falta ${i.missing.join(", ")}`);
    process.exit(1);
  }

  const header = `-- ─────────────────────────────────────────────────────────────────────────────
-- GENERADO por packages/db/scripts/build-food-catalog.ts — no editar a mano.
-- Catálogo de alimentos (ADR 0018): ${result.rows.length} alimentos curados (AR) con
-- nutrientes por 100 g de USDA FoodData Central, SR Legacy (dominio público, CC0).
-- Fuente: U.S. Department of Agriculture, Agricultural Research Service.
-- FoodData Central, 2019. fdc.nal.usda.gov
-- ─────────────────────────────────────────────────────────────────────────────
`;
  writeFileSync(out, toSql(result.rows, header));
  console.log(`✓ ${result.rows.length} alimentos → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
