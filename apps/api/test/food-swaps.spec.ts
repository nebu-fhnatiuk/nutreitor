import { equivalentSwaps, type FoodDto } from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/** Intercambios por equivalencia calculada (Fase 4.2): lógica pura. */
const food = (id: string, kcal: number, p: number, c: number, g: number): FoodDto => ({
  id,
  source: "catalog",
  name: id,
  group: "Cereales",
  per100g: { energyKcal: kcal, proteinG: p, carbsG: c, fatG: g, fiberG: null, sugarsG: null, satFatG: null, sodiumMg: null },
  portions: [],
  extra: {},
  attribution: null,
  archived: false,
});

const arroz = food("arroz", 130, 2.7, 28.2, 0.3);
const fideos = food("fideos", 158, 5.8, 30.9, 0.9);
const pan = food("pan", 266, 8.9, 49.4, 3.3);
const galletitaManteca = food("galletita", 480, 6, 60, 24);
const sinEnergia = food("agua", 0, 0, 0, 0);

describe("equivalentSwaps", () => {
  it("ajusta los gramos para dar las mismas kcal que el original", () => {
    const [s] = equivalentSwaps(arroz, 160, [fideos]);
    // 160 g de arroz = 208 kcal → 208 / 1,58 ≈ 132 g de fideos.
    expect(s!.grams).toBe(132);
    expect(Math.round((s!.food.per100g.energyKcal * s!.grams) / 100)).toBeCloseTo(208, -1);
  });

  it("ordena por parecido del reparto de macros (grasa alta queda al final)", () => {
    const names = equivalentSwaps(arroz, 160, [galletitaManteca, pan, fideos]).map((s) => s.food.id);
    expect(names[0]).toBe("fideos");
    expect(names.at(-1)).toBe("galletita");
  });

  it("excluye el mismo alimento, los sin energía y las cantidades irreales", () => {
    const tiny = food("aceite", 884, 0, 0, 100); // 208 kcal = 24 g: realista
    const huge = food("lechuga", 15, 1.4, 2.9, 0.2); // 208 kcal = 1387 g > 3× → fuera
    const ids = equivalentSwaps(arroz, 160, [arroz, sinEnergia, tiny, huge]).map((s) => s.food.id);
    expect(ids).toEqual(["aceite"]);
  });

  it("informa la diferencia de macros respecto del original", () => {
    const [s] = equivalentSwaps(arroz, 100, [pan]);
    // 130 kcal de pan = 49 g → P 4,4 vs 2,7 del arroz.
    expect(s!.grams).toBe(49);
    expect(s!.delta.proteinG).toBeCloseTo(1.7, 1);
  });
});
