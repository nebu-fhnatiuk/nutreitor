import { planAlerts, type AllergenKey, type AllergyFlag, type DayPlan, type EnergyInputs, type EnergySubject, type MealPlanBody, type PlanAlertContext, type PlanAlertRule } from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/**
 * Motor de alertas, sección C (KAN-97). Umbrales validados por la nutricionista en
 * docs/validation/alertas.md. Cada regla tiene un caso que dispara y uno que no.
 *
 * Deportista de referencia: 60 kg, 48 kg de masa libre de grasa. Entrenamiento de
 * fútbol de 90 min: (7 − 1) × 60 × 1,5 = 540 kcal de ejercicio.
 */
const subject: EnergySubject = { sex: "female", ageYears: 25, weightKg: 60, heightCm: 165, ffmKg: 48 };

const energy: EnergyInputs = {
  formula: "mifflin",
  activityFactor: 1.4,
  adjustmentPct: 0,
  dayTypes: [
    { id: "t", name: "Entrenamiento", sessions: [{ activity: "football_training", minutes: 90 }], choGPerKg: 7, proGPerKg: 1.6 },
    { id: "r", name: "Descanso", sessions: [], choGPerKg: 4, proGPerKg: 1.6 },
  ],
  week: { mon: "t", sun: "r" },
};

const day = (kcal: number, protein_g: number, carbs_g: number, fat_g: number) => ({
  meals: [{ name: "Día", items: [{ text: "Total del día", macros: { kcal, protein_g, carbs_g, fat_g } }] }],
});

// Días "limpios": no disparan ninguna regla.
const TRAINING = day(2800, 96, 420, 78); // DE 47,1 · 1,6 g/kg P · 7 g/kg HC · 25 % grasa
const REST = day(2200, 96, 240, 61); // DE 45,8 · 4 g/kg HC · 25 % grasa

const week = (mon: DayPlan = TRAINING, sun: DayPlan = REST, targets = { mon: 2800, sun: 2200 }): MealPlanBody => ({
  layout: "week",
  days: { mon, sun },
  dayTargets: { mon: { kcal: targets.mon }, sun: { kcal: targets.sun } },
});

const rules = (body: MealPlanBody, ctx: PlanAlertContext = { subject, energy, allergyFlags: [] }) => planAlerts(body, ctx).alerts.map((a) => `${a.day}:${a.rule}`);
const only = (rule: PlanAlertRule, body: MealPlanBody) => planAlerts(body, { subject, energy, allergyFlags: [] }).alerts.filter((a) => a.rule === rule);

describe("plan de referencia", () => {
  it("no dispara ninguna alerta", () => {
    const r = planAlerts(week(), { subject, energy, allergyFlags: [] });
    expect(r.alerts).toEqual([]);
    expect(r.notEvaluated).toEqual([]);
    expect(r.missing).toEqual([]);
  });
});

describe("C1 · energía frente al objetivo", () => {
  it("dispara con más de +10 % en un día de entrenamiento", () => {
    const [a] = only("C1", week(TRAINING, REST, { mon: 2500, sun: 2200 })); // +12 %
    expect(a).toMatchObject({ day: "mon", level: "info", value: 12 });
    expect(a!.message).toContain("+12 %");
  });

  it("en descanso tolera hasta ±15 %", () => {
    expect(only("C1", week(TRAINING, REST, { mon: 2800, sun: 1960 }))).toEqual([]); // +12 %
    expect(only("C1", week(TRAINING, REST, { mon: 2800, sun: 1880 }))).toHaveLength(1); // +17 %
  });

  it("también dispara por debajo del objetivo", () => {
    expect(only("C1", week(TRAINING, REST, { mon: 3300, sun: 2200 }))[0]).toMatchObject({ value: -15 });
  });
});

describe("C2 y C3 · disponibilidad energética", () => {
  it("C2 importante por debajo de 30 kcal/kg MLG", () => {
    const [a] = only("C2", week(day(1900, 96, 400, 50))); // (1900 − 540) / 48 = 28,3
    expect(a).toMatchObject({ day: "mon", level: "important", value: 28.3 });
  });

  it("C3 informativa entre 30 y 45", () => {
    const body = week(day(2300, 96, 400, 64)); // (2300 − 540) / 48 = 36,7
    expect(only("C3", body)[0]).toMatchObject({ level: "info", value: 36.7 });
    expect(only("C2", body)).toEqual([]);
  });

  it("C3 no salta si el objetivo es bajar peso (déficit)", () => {
    const body = week(day(2300, 96, 400, 64));
    const r = planAlerts(body, { subject, energy: { ...energy, adjustmentPct: -10 } });
    expect(r.alerts.filter((a) => a.rule === "C3")).toEqual([]);
  });

  it("sin masa libre de grasa no se evalúa y se avisa", () => {
    const r = planAlerts(week(day(1900, 96, 400, 50)), { subject: { ...subject, ffmKg: null }, energy });
    expect(r.alerts.filter((a) => a.rule === "C2")).toEqual([]);
    expect(r.missing.join(" ")).toContain("masa libre de grasa");
  });
});

describe("C4 · proteína", () => {
  it("dispara por debajo de 1,2 y por encima de 2,0 g/kg", () => {
    expect(only("C4", week(day(2800, 60, 420, 78)))[0]).toMatchObject({ value: 1 });
    expect(only("C4", week(day(2800, 150, 420, 78)))[0]).toMatchObject({ value: 2.5 });
  });

  it("muestra los g/kg con un decimal fijo", () => {
    expect(only("C4", week(day(2800, 60, 420, 78)))[0]!.message).toBe(
      "El plan aporta 1,0 g/kg de proteína; la referencia para deportistas es 1,2–2,0 g/kg.",
    );
  });

  it("no dispara en los bordes del rango", () => {
    expect(only("C4", week(day(2800, 72, 420, 78)))).toEqual([]); // 1,2
    expect(only("C4", week(day(2800, 120, 420, 78)))).toEqual([]); // 2,0
  });
});

describe("C5 · hidratos según la carga", () => {
  it("90 min de entrenamiento: banda 6–10 g/kg", () => {
    expect(only("C5", week(day(2800, 96, 300, 78)))[0]).toMatchObject({ value: 5 });
    expect(only("C5", week(day(2800, 96, 360, 78)))).toEqual([]); // 6
  });

  it("descanso: banda 3–5 g/kg", () => {
    expect(only("C5", week(TRAINING, day(2200, 96, 360, 61)))[0]).toMatchObject({ day: "sun", value: 6 });
  });

  it("sin requerimiento no se evalúa", () => {
    const r = planAlerts(week(day(2800, 96, 300, 78)), { subject, energy: null });
    expect(r.alerts.filter((a) => a.rule === "C5")).toEqual([]);
  });
});

describe("C6 · grasa", () => {
  it("dispara por debajo de 20 % y por encima de 35 %", () => {
    expect(only("C6", week(day(2800, 96, 420, 50)))[0]).toMatchObject({ value: 16 });
    expect(only("C6", week(day(2800, 96, 420, 120)))[0]).toMatchObject({ value: 39 });
  });
});

describe("plan de día-tipo", () => {
  const body: MealPlanBody = { layout: "day", day: day(1900, 60, 400, 30), targets: { kcal: 2800 } };

  it("evalúa C1, C4 y C6, pero no la disponibilidad energética ni la banda de hidratos", () => {
    expect(rules(body)).toEqual(["day:C1", "day:C4", "day:C6"]);
    expect(planAlerts(body, { subject, energy }).missing.join(" ")).toContain("día-tipo");
  });
});

describe("días con macros incompletos", () => {
  it("no se evalúan y quedan listados", () => {
    const incompleto = { meals: [{ name: "Almuerzo", items: [{ text: "Milanesa", macros: { kcal: 500 } }, { text: "Ensalada a gusto" }] }] };
    const r = planAlerts(week(incompleto), { subject, energy });
    expect(r.alerts.filter((a) => a.day === "mon")).toEqual([]);
    expect(r.notEvaluated).toEqual([expect.objectContaining({ day: "mon", reason: expect.stringContaining("1 de 2") })]);
  });
});

describe("orden", () => {
  it("primero las importantes, después por día y por regla", () => {
    const body = week(day(1900, 60, 400, 30), day(2200, 96, 360, 61), { mon: 2800, sun: 2200 });
    expect(rules(body)).toEqual(["mon:C2", "mon:C1", "mon:C4", "mon:C6", "sun:C5"]);
  });
});

// ── Sección A · alergias e intolerancias (KAN-105) ─────────────────────────────

const linked = (text: string, allergens: AllergenKey[] | undefined, kcal = 200) => ({
  text,
  macros: { kcal, protein_g: 10, carbs_g: 20, fat_g: 5 },
  food: {
    source: "catalog" as const,
    id: "00000000-0000-4000-8000-000000000001",
    grams: 100,
    per100g: { kcal, protein_g: 10, carbs_g: 20, fat_g: 5 },
    ...(allergens ? { allergens } : {}),
  },
});
const meals = (...ms: [string, ReturnType<typeof linked>[]][]): DayPlan => ({
  meals: ms.map(([name, items]) => ({ name, items })),
});
const dayPlan = (d: DayPlan): MealPlanBody => ({ layout: "day", day: d });
/** Solo las alertas de la sección A (las de energía se prueban arriba). */
const aAlerts = (body: MealPlanBody, allergyFlags: AllergyFlag[] | null) => {
  const r = planAlerts(body, { subject, energy: null, allergyFlags });
  return { ...r, alerts: r.alerts.filter((a) => a.rule.startsWith("A")) };
};

describe("A1 · alergia tildada", () => {
  it("un alimento con un alérgeno: el texto validado", () => {
    const r = aAlerts(dayPlan(meals(["Merienda", [linked("Maní tostado", ["mani"]), linked("Banana", [])]])), ["mani"]);
    expect(r.alerts.filter((a) => a.rule === "A1")).toEqual([
      expect.objectContaining({
        level: "important",
        message: "El plan incluye Maní tostado, que contiene maní. En la ficha figura alergia a maní.",
      }),
    ]);
  });

  it("varios alimentos: una sola alerta por día que los lista", () => {
    const body = dayPlan(meals(["Desayuno", [linked("Leche entera", ["leche", "lactosa"]), linked("Pan blanco", ["tacc"])]], ["Merienda", [linked("Maní tostado", ["mani"])]]));
    const [a] = aAlerts(body, ["mani", "leche"]).alerts.filter((x) => x.rule === "A1");
    expect(a).toMatchObject({ value: 2 });
    expect(a!.message).toBe("El plan incluye Leche entera (leche) y Maní tostado (maní): alimentos con alérgenos que figuran en la ficha.");
  });

  it("no salta si el alérgeno no está tildado", () => {
    expect(aAlerts(dayPlan(meals(["Merienda", [linked("Maní tostado", ["mani"])]])), ["huevo"]).alerts).toEqual([]);
  });
});

describe("A2 · celiaquía", () => {
  it("salta con alimentos con TACC", () => {
    const [a] = aAlerts(dayPlan(meals(["Almuerzo", [linked("Fideos", ["tacc"]), linked("Pan blanco", ["tacc"])]])), ["celiaquia"]).alerts;
    expect(a).toMatchObject({ rule: "A2", level: "important", message: "Fideos y Pan blanco contienen gluten (TACC). En la ficha figura celiaquía." });
  });

  it("no salta sin celiaquía tildada (aunque haya TACC)", () => {
    expect(aAlerts(dayPlan(meals(["Almuerzo", [linked("Fideos", ["tacc"])]])), ["mani"]).alerts).toEqual([]);
  });
});

describe("A3 · intolerancia a la lactosa", () => {
  it("informativa, agrupa por comida", () => {
    const body = dayPlan(meals(["Desayuno", [linked("Leche entera", ["leche", "lactosa"])]], ["Cena", [linked("Ricota", ["leche", "lactosa"]), linked("Queso rallado", ["leche"])]]));
    const [a] = aAlerts(body, ["intolerancia_lactosa"]).alerts;
    expect(a).toMatchObject({ rule: "A3", level: "info", value: 2 });
    expect(a!.message).toBe(
      "Las comidas Desayuno (Leche entera) y Cena (Ricota) incluyen alimentos con lactosa. Con intolerancia suele tolerarse hasta unos 12 g por toma.",
    );
  });

  it("la leche sin lactosa (queso estacionado) no la dispara", () => {
    expect(aAlerts(dayPlan(meals(["Cena", [linked("Queso rallado", ["leche"])]])), ["intolerancia_lactosa"]).alerts).toEqual([]);
  });
});

describe("sección A · datos que faltan", () => {
  it("sin conocer las casillas de la ficha no evalúa y lo avisa", () => {
    const r = aAlerts(dayPlan(meals(["Merienda", [linked("Maní tostado", ["mani"])]])), null);
    expect(r.alerts).toEqual([]);
    expect(r.missing.join(" ")).toContain("No se conocen las alergias");
  });

  it("los alimentos sin datos de alérgenos se cuentan y se avisan, no se suponen limpios", () => {
    const body = dayPlan({ meals: [{ name: "Merienda", items: [{ text: "Galletitas caseras" }, linked("Barrita vieja", undefined)] }] });
    const r = aAlerts(body, ["mani"]);
    expect(r.alerts).toEqual([]);
    expect(r.missing.join(" ")).toContain("2 alimentos no tienen datos de alérgenos");
  });

  it("se evalúa aunque falten kcal en el día (no depende de los macros)", () => {
    const body = dayPlan({ meals: [{ name: "Merienda", items: [{ ...linked("Maní tostado", ["mani"]), macros: undefined }] }] });
    const r = aAlerts(body, ["mani"]);
    expect(r.alerts.map((a) => a.rule)).toEqual(["A1"]);
    expect(r.notEvaluated).toHaveLength(1);
  });

  it("las importantes de alergias van antes que las de energía", () => {
    const body: MealPlanBody = { layout: "day", day: meals(["Día", [linked("Maní tostado", ["mani"], 1900)]]), targets: { kcal: 2800 } };
    expect(planAlerts(body, { subject, energy, allergyFlags: ["mani"] }).alerts.map((a) => a.rule)[0]).toBe("A1");
  });
});
