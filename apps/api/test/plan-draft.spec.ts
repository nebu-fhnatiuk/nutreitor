import { planDraftProposalSchema, resolvePlanDraft, type FoodDto } from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/** Borrador de NUTRI (ADR 0020): la API resuelve la propuesta contra el catálogo. */
const food = (slug: string, kcal: number, p: number, c: number, g: number): FoodDto => ({
  id: `00000000-0000-4000-8000-${String(slug.length).padStart(12, "0")}`,
  slug,
  source: "catalog",
  name: slug.replace(/-/g, " "),
  group: "Cereales",
  per100g: { energyKcal: kcal, proteinG: p, carbsG: c, fatG: g, fiberG: null, sugarsG: null, satFatG: null, sodiumMg: null },
  portions: [{ label: "1 taza", grams: 160 }],
  extra: {},
  attribution: "USDA FoodData Central",
  archived: false,
});
const catalog = new Map([["avena-arrollada", food("avena-arrollada", 379, 13.2, 67.7, 6.5)]]);

describe("resolvePlanDraft", () => {
  it("vincula cada item al catálogo en gramos y calcula los macros (no los del modelo)", () => {
    const proposal = planDraftProposalSchema.parse({
      meals: [{ name: "Desayuno", time: "08:00", items: [{ slug: "avena-arrollada", grams: 40.4 }] }],
    });
    const { body, unresolved } = resolvePlanDraft(proposal, catalog, { kcal: 1900 });
    expect(unresolved).toEqual([]);
    expect(body.layout === "day" && body.targets).toEqual({ kcal: 1900 });
    const item = body.layout === "day" ? body.day.meals[0]!.items[0]! : null;
    expect(item).toMatchObject({ text: "avena arrollada", qty: 40, unit: "g" });
    expect(item!.food).toMatchObject({ source: "catalog", grams: 40, attribution: "USDA FoodData Central" });
    expect(item!.food!.portion).toBeUndefined();
    expect(item!.macros).toEqual({ protein_g: 5.3, carbs_g: 27.1, fat_g: 2.6, kcal: 152 });
  });

  it("descarta slugs inexistentes y las comidas que quedan vacías", () => {
    const proposal = planDraftProposalSchema.parse({
      meals: [
        { name: "Desayuno", items: [{ slug: "avena-arrollada", grams: 40 }, { slug: "inventado", grams: 10 }] },
        { name: "Cena", items: [{ slug: "otro-inventado", grams: 100 }] },
      ],
    });
    const { body, unresolved } = resolvePlanDraft(proposal, catalog);
    expect(unresolved).toEqual(["inventado", "otro-inventado"]);
    expect(body.layout === "day" && body.day.meals.map((m) => m.name)).toEqual(["Desayuno"]);
  });

  it("rechaza una propuesta con forma inválida (salida de un modelo)", () => {
    expect(planDraftProposalSchema.safeParse({ meals: [] }).success).toBe(false);
    expect(planDraftProposalSchema.safeParse({ meals: [{ name: "X", items: [{ slug: "a", grams: -5 }] }] }).success).toBe(false);
  });
});
