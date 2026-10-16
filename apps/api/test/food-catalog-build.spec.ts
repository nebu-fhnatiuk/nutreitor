import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCatalog, toSql, type CuratedFood } from "@nutreitor/db/catalog";
import { describe, expect, it } from "vitest";

/**
 * Compilación del catálogo de alimentos (ADR 0018), sin el dataset de USDA: la
 * lógica pura de match, nutrientes obligatorios y generación del SQL, más la
 * validación estructural de la curación AR que se commitea.
 */
const here = dirname(fileURLToPath(import.meta.url));
const curation = JSON.parse(
  readFileSync(join(here, "../../../packages/db/catalog/foods-ar.curation.json"), "utf8"),
) as { foods: CuratedFood[] };

const RICE: CuratedFood = {
  slug: "arroz",
  name: "Arroz blanco, cocido",
  group: "Cereales",
  usda: "Rice, white, long-grain, regular, enriched, cooked",
  portions: [{ label: "1 taza", grams: 160 }],
};
const foods = new Map([
  ["Rice, white, long-grain, regular, enriched, cooked", "169756"],
  ["Rice, brown, long-grain, cooked", "169704"],
]);
const full = new Map([
  [1008, 130], [1003, 2.69], [1004, 0.28], [1005, 28.17], [1079, 0.4], [1093, 1], [1089, 1.2],
]);

describe("buildCatalog", () => {
  it("toma los nutrientes por 100 g del fdc_id que matchea la descripción exacta", () => {
    const { rows, unmatched, incomplete } = buildCatalog([RICE], foods, new Map([["169756", full]]));
    expect(unmatched).toEqual([]);
    expect(incomplete).toEqual([]);
    expect(rows[0]).toMatchObject({
      fdcId: "169756",
      core: { energyKcal: 130, proteinG: 2.69, fatG: 0.28, carbsG: 28.17, sugarsG: null },
      extra: { iron_mg: 1.2 },
    });
  });

  it("una descripción que no existe se reporta con sugerencias, no se inventa", () => {
    const typo = { ...RICE, usda: "Rice, white, cooked" };
    const { rows, unmatched } = buildCatalog([typo], foods, new Map());
    expect(rows).toEqual([]);
    expect(unmatched[0]!.suggestions[0]).toMatch(/^Rice, /);
  });

  it("si falta un nutriente obligatorio (kcal/P/C/G) el alimento no entra", () => {
    const sinKcal = new Map(full);
    sinKcal.delete(1008);
    const { rows, incomplete } = buildCatalog([RICE], foods, new Map([["169756", sinKcal]]));
    expect(rows).toEqual([]);
    expect(incomplete[0]!.missing).toEqual(["Energy"]);
  });

  it("rechaza slugs duplicados", () => {
    expect(() => buildCatalog([RICE, RICE], foods, new Map())).toThrow(/duplicado/);
  });
});

describe("toSql", () => {
  it("genera un upsert por slug con atribución y escapa comillas", () => {
    const { rows } = buildCatalog(
      [{ ...RICE, name: "Arroz 'largo fino'" }],
      foods,
      new Map([["169756", full]]),
    );
    const sql = toSql(rows, "-- header");
    expect(sql).toContain("ON CONFLICT (slug) DO UPDATE SET");
    expect(sql).toContain("'Arroz ''largo fino'''");
    expect(sql).toContain("'usda', '169756'");
    expect(sql).toContain("NULL"); // sugars sin dato
  });
});

describe("curación AR commiteada", () => {
  it("slugs únicos, en kebab-case, con nombre y grupo", () => {
    const slugs = curation.foods.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const f of curation.foods) {
      expect(f.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(f.name.trim()).not.toBe("");
      expect(f.group.trim()).not.toBe("");
      expect(f.usda.trim()).not.toBe("");
    }
  });

  it("toda medida casera tiene etiqueta y gramos plausibles", () => {
    for (const f of curation.foods) {
      expect(f.portions.length).toBeGreaterThan(0);
      for (const p of f.portions) {
        expect(p.label.trim()).not.toBe("");
        expect(p.grams).toBeGreaterThan(0);
        expect(p.grams).toBeLessThanOrEqual(500);
      }
    }
  });
});
