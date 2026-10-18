import {
  dayMacros,
  macroCoverage,
  mealsForDate,
  weekdayOf,
  macrosForGrams,
  savePlanSchema,
  sumMacros,
  targetDeviation,
} from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/**
 * Cálculo nutricional del plan (ADR 0018): macros de un alimento vinculado a partir
 * de su copia por 100 g, totales del día y desvío contra el objetivo. También que el
 * schema del plan acepte (y acote) el vínculo con la base de alimentos.
 */
const RICE = { kcal: 130, protein_g: 2.69, carbs_g: 28.17, fat_g: 0.28 };
const UUID = "11111111-1111-1111-1111-111111111111";

describe("macrosForGrams", () => {
  it("escala los valores por 100 g a la cantidad (1 taza de arroz = 160 g)", () => {
    expect(macrosForGrams(RICE, 160)).toEqual({ protein_g: 4.3, carbs_g: 45.1, fat_g: 0.4, kcal: 208 });
  });

  it("100 g devuelve los valores de referencia", () => {
    expect(macrosForGrams(RICE, 100)).toMatchObject({ kcal: 130, carbs_g: 28.2 });
  });
});

describe("sumMacros / dayMacros", () => {
  it("suma sólo las claves cargadas y no inventa ceros", () => {
    expect(sumMacros([{ kcal: 100 }, { kcal: 50, protein_g: 5 }, undefined])).toEqual({
      kcal: 150,
      protein_g: 5,
    });
    expect(sumMacros([undefined, {}])).toBeNull();
  });

  it("el total del día suma todas las comidas, vinculadas y manuales", () => {
    const day = {
      meals: [
        { name: "Almuerzo", items: [{ text: "Arroz", macros: macrosForGrams(RICE, 160) }] },
        { name: "Cena", items: [{ text: "Algo manual", macros: { kcal: 300, protein_g: 20 } }, { text: "Agua" }] },
      ],
    };
    expect(dayMacros(day)).toEqual({ protein_g: 24.3, carbs_g: 45.1, fat_g: 0.4, kcal: 508 });
  });
});

describe("targetDeviation", () => {
  it("devuelve el desvío en % (positivo = se pasa)", () => {
    expect(targetDeviation(2200, 2000)).toBe(10);
    expect(targetDeviation(1800, 2000)).toBe(-10);
  });

  it("sin objetivo o sin total no hay desvío", () => {
    expect(targetDeviation(undefined, 2000)).toBeNull();
    expect(targetDeviation(1800, undefined)).toBeNull();
    expect(targetDeviation(1800, 0)).toBeNull();
  });
});

describe("savePlanSchema con items vinculados a la base", () => {
  const plan = (food: unknown) => ({
    title: "Plan",
    body: {
      layout: "day",
      day: { meals: [{ name: "Almuerzo", items: [{ text: "Arroz", qty: 1, unit: "taza", food }] }] },
    },
  });
  const ref = {
    source: "catalog",
    id: UUID,
    grams: 160,
    portion: { label: "1 taza", grams: 160 },
    count: 1,
    portions: [{ label: "1 taza", grams: 160 }],
    per100g: RICE,
    attribution: "USDA FoodData Central",
  };

  it("acepta un item con vínculo completo", () => {
    expect(savePlanSchema.safeParse(plan(ref)).success).toBe(true);
  });

  it("los items sin vínculo siguen siendo válidos (texto libre intacto)", () => {
    expect(savePlanSchema.safeParse(plan(undefined)).success).toBe(true);
  });

  it("rechaza vínculos inválidos: origen desconocido, id no uuid, gramos fuera de rango", () => {
    for (const bad of [
      { ...ref, source: "otro" },
      { ...ref, id: "123" },
      { ...ref, grams: 0 },
      { ...ref, grams: 99999 },
      { ...ref, per100g: { ...RICE, kcal: 5000 } },
    ]) {
      expect(savePlanSchema.safeParse(plan(bad)).success).toBe(false);
    }
  });
});

describe("mealsForDate (lo que te toca hoy, en el portal)", () => {
  const meal = (name: string) => ({ name, items: [{ text: name }] });
  // 2026-10-19 es lunes; se construye en hora local para no depender del huso.
  const monday = new Date(2026, 9, 19, 12);
  const sunday = new Date(2026, 9, 18, 12);

  it("día-tipo: siempre las mismas comidas", () => {
    const body = { layout: "day" as const, day: { meals: [meal("Desayuno")] } };
    expect(mealsForDate(body, monday).map((m) => m.name)).toEqual(["Desayuno"]);
    expect(mealsForDate(body, sunday).map((m) => m.name)).toEqual(["Desayuno"]);
  });

  it("semanal: las del día de la semana; vacío si ese día no se cargó", () => {
    const body = { layout: "week" as const, days: { mon: { meals: [meal("Lunes")] } } };
    expect(weekdayOf(monday)).toBe("mon");
    expect(mealsForDate(body, monday).map((m) => m.name)).toEqual(["Lunes"]);
    expect(mealsForDate(body, sunday)).toEqual([]);
  });
});

describe("macroCoverage (total completo o parcial)", () => {
  it("es parcial si algún item no tiene kcal", () => {
    const day = {
      meals: [
        { name: "Desayuno", items: [{ text: "Avena", macros: { kcal: 250 } }, { text: "Café" }] },
      ],
    };
    expect(macroCoverage(day)).toEqual({ items: 2, withKcal: 1, complete: false });
  });

  it("es completo si todos tienen kcal; un día vacío no cuenta como completo", () => {
    expect(macroCoverage({ meals: [{ name: "A", items: [{ text: "x", macros: { kcal: 1 } }] }] }).complete).toBe(true);
    expect(macroCoverage({ meals: [] }).complete).toBe(false);
  });
});
