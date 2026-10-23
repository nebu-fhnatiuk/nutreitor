import {
  dayKind,
  energyResults,
  faoWho,
  harrisBenedict,
  mifflin,
  cunningham,
  saveEnergySchema,
  type EnergyInputs,
} from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/**
 * Requerimiento energético (ADR 0032). Los valores esperados salen de una
 * implementación independiente en Python de las mismas fórmulas: atrapa errores de
 * transcripción de coeficientes.
 */
const FUTBOLISTA = { sex: "male" as const, ageYears: 24, weightKg: 74.2, heightCm: 178.4, ffmKg: 64.2 };

const INPUTS: EnergyInputs = {
  formula: "mifflin",
  activityFactor: 1.5,
  adjustmentPct: 0,
  dayTypes: [
    { id: "t", name: "Entrenamiento", choGPerKg: 6, proGPerKg: 1.8, sessions: [{ activity: "football_training", minutes: 90 }, { activity: "strength_vigorous", minutes: 30 }] },
    { id: "p", name: "Partido", choGPerKg: 8, proGPerKg: 1.8, sessions: [{ activity: "football_match", minutes: 95 }] },
    { id: "d", name: "Descanso", choGPerKg: 3, proGPerKg: 1.8, sessions: [] },
  ],
  week: { mon: "t", tue: "t", wed: "d", thu: "t", fri: "t", sat: "p", sun: "d" },
};

const ok = <T>(c: { ok: true; value: T } | { ok: false; reason: string }): T => {
  if (!c.ok) throw new Error(c.reason);
  return c.value;
};

describe("gasto energético en reposo", () => {
  it("varón 24 años, 74,2 kg, 178,4 cm, MLG 64,2 kg", () => {
    expect(ok(mifflin(FUTBOLISTA))).toBe(1742);
    expect(ok(harrisBenedict(FUTBOLISTA))).toBe(1802);
    expect(ok(faoWho(FUTBOLISTA))).toBe(1814);
    expect(ok(cunningham(FUTBOLISTA))).toBe(1912);
  });

  it("mujer 31 años, 56,8 kg, 164 cm; juvenil de 15 por FAO/OMS", () => {
    const f = { sex: "female" as const, ageYears: 31, weightKg: 56.8, heightCm: 164, ffmKg: null };
    expect(ok(mifflin(f))).toBe(1277);
    expect(ok(harrisBenedict(f))).toBe(1347);
    expect(ok(faoWho(f))).toBe(1323);
    expect(cunningham(f)).toMatchObject({ ok: false, reason: expect.stringContaining("masa libre de grasa") });
    expect(ok(faoWho({ sex: "male", ageYears: 15, weightKg: 60, heightCm: null, ffmKg: null }))).toBe(1701);
  });

  it("sin sexo binario sólo queda Cunningham", () => {
    const s = { ...FUTBOLISTA, sex: null };
    expect(mifflin(s).ok).toBe(false);
    expect(faoWho(s).ok).toBe(false);
    expect(cunningham(s).ok).toBe(true);
  });
});

describe("tipos de día", () => {
  const r = energyResults(INPUTS, FUTBOLISTA);
  const days = ok(r.days);

  it("entrenamiento: GER × factor + (MET − 1) × peso × horas; grasa = resto", () => {
    expect(days[0]).toMatchObject({ baseKcal: 2613, exerciseKcal: 853, targetKcal: 3466, choG: 445, proG: 134, fatG: 128, fatGPerKg: 1.7, fatPct: 33, choPct: 51, warnings: [] });
  });

  it("partido y descanso; avisa la grasa fuera de 20–35 %", () => {
    expect(days[1]).toMatchObject({ exerciseKcal: 1057, targetKcal: 3670, choG: 594, fatG: 85, fatPct: 21 });
    expect(days[2]).toMatchObject({ exerciseKcal: 0, targetKcal: 2613, choG: 223, fatG: 132, fatPct: 45 });
    expect(days[2]!.warnings[0]).toContain("45 %");
  });

  it("semana tipo completa → promedio; el ajuste baja el objetivo", () => {
    expect(r.weekAvgKcal).toBe(3251);
    const deficit = ok(energyResults({ ...INPUTS, adjustmentPct: -10 }, FUTBOLISTA).days);
    expect(deficit[2]).toMatchObject({ targetKcal: 2352, fatG: 103 });
    expect(energyResults({ ...INPUTS, week: { mon: "t" } }, FUTBOLISTA).weekAvgKcal).toBeNull();
  });

  it("si CHO + PRO superan la energía, la grasa queda en 0 y se avisa", () => {
    const d = ok(energyResults({ ...INPUTS, dayTypes: [{ ...INPUTS.dayTypes[2]!, choGPerKg: 12 }] }, FUTBOLISTA).days)[0]!;
    expect(d.fatG).toBe(0);
    expect(d.warnings[0]).toContain("no queda lugar");
  });
});

describe("validación", () => {
  const base = { ...INPUTS, weightKg: 74.2, heightCm: 178.4, ffmKg: 64.2 };
  it("acepta lo bien formado y rechaza inconsistencias", () => {
    expect(saveEnergySchema.safeParse(base).success).toBe(true);
    expect(saveEnergySchema.safeParse({ ...base, week: { mon: "x" } }).success).toBe(false);
    expect(saveEnergySchema.safeParse({ ...base, ffmKg: 80 }).success).toBe(false);
    expect(saveEnergySchema.safeParse({ ...base, dayTypes: [{ ...base.dayTypes[0]!, sessions: [{ activity: "custom", minutes: 30 }] }], week: {} }).success).toBe(false);
    expect(saveEnergySchema.safeParse({ ...base, dayTypes: [base.dayTypes[0]!, base.dayTypes[0]!], week: {} }).success).toBe(false);
  });
});

describe("tipo de día para la tira de la semana", () => {
  it("por nombre: partido, descanso; si no, entrenamiento", () => {
    expect(dayKind("Partido")).toBe("match");
    expect(dayKind("Día de competencia")).toBe("match");
    expect(dayKind("Carrera 10K")).toBe("match");
    expect(dayKind("Descanso activo")).toBe("rest");
    expect(dayKind("Recuperación")).toBe("rest");
    expect(dayKind("Doble turno")).toBe("training");
  });

  it("sin sesiones es descanso, salvo que el nombre diga partido", () => {
    expect(dayKind("Liviano", 0)).toBe("rest");
    expect(dayKind("Liviano", 1)).toBe("training");
    expect(dayKind("Partido", 0)).toBe("match");
  });
});
