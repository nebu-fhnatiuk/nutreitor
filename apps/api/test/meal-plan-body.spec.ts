import { normalizeMealPlanBody, savePlanSchema } from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/**
 * Compatibilidad del body multi-estilo. El plan pasó de `{ meals, generalNotes }`
 * (legacy, sin layout) a un documento discriminado por `layout`. La normalización
 * envuelve lo legacy a `layout: "day"` sin pérdida, y es idempotente sobre lo nuevo.
 */
describe("normalizeMealPlanBody", () => {
  it("envuelve un body legacy a layout day preservando comidas y notas", () => {
    const legacy = {
      meals: [{ name: "Desayuno", items: [{ text: "Avena", note: "60 g" }] }],
      generalNotes: "2 L de agua",
    };
    expect(normalizeMealPlanBody(legacy)).toEqual({
      layout: "day",
      day: { meals: [{ name: "Desayuno", items: [{ text: "Avena", note: "60 g" }] }] },
      generalNotes: "2 L de agua",
    });
  });

  it("es idempotente: un body nuevo (con layout) pasa sin cambios", () => {
    const fresh = { layout: "day", day: { meals: [] }, targets: { kcal: 1900 } };
    expect(normalizeMealPlanBody(fresh)).toBe(fresh);
  });

  it("legacy sin generalNotes no inventa la clave", () => {
    expect(normalizeMealPlanBody({ meals: [] })).toEqual({
      layout: "day",
      day: { meals: [] },
    });
  });

  it("shapes degenerados (null, {}, basura) caen a un día vacío (blindaje)", () => {
    const emptyDay = { layout: "day", day: { meals: [] } };
    expect(normalizeMealPlanBody(null)).toEqual(emptyDay);
    expect(normalizeMealPlanBody({})).toEqual(emptyDay);
    expect(normalizeMealPlanBody("nope")).toEqual(emptyDay);
  });
});

describe("savePlanSchema", () => {
  it("acepta un body nuevo con detalle (qty/unit/alternatives/macros/targets)", () => {
    const r = savePlanSchema.safeParse({
      title: "Plan",
      startDate: null,
      body: {
        layout: "day",
        day: {
          meals: [
            {
              name: "Almuerzo",
              items: [
                {
                  text: "Pollo",
                  qty: 150,
                  unit: "g",
                  macros: { protein_g: 35, kcal: 200 },
                  alternatives: [{ text: "Merluza", qty: 180, unit: "g" }],
                },
              ],
            },
          ],
        },
        targets: { protein_g: 130, kcal: 1900 },
      },
    });
    expect(r.success).toBe(true);
  });

  it("acepta y normaliza un body legacy en el alta (preprocess)", () => {
    const r = savePlanSchema.safeParse({
      title: "Plan",
      body: { meals: [{ name: "Cena", items: [{ text: "Sopa" }] }] },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body.layout).toBe("day");
  });

  it("acepta el layout semanal (forward-compatible para A2)", () => {
    const r = savePlanSchema.safeParse({
      title: "Semanal",
      body: { layout: "week", days: { mon: { meals: [] }, fri: { meals: [] } } },
    });
    expect(r.success).toBe(true);
  });
});
