import {
  ageAt,
  anthropometryResults,
  finalValue,
  needsThirdTake,
  saveAnthropometrySchema,
  type AnthroSiteKey,
  type AnthroTakes,
} from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/**
 * Cálculos de antropometría ISAK (ADR 0030). Los valores esperados salen de una
 * implementación independiente en Python de las mismas fórmulas publicadas: atrapa
 * errores de transcripción. La validación clínica la hace la nutricionista contra su
 * planilla (hasta entonces, ANTHROPOMETRY_VALIDATED = false).
 */
const single = (v: Partial<Record<AnthroSiteKey, number>>): AnthroTakes =>
  Object.fromEntries(Object.entries(v).map(([k, n]) => [k, [n]])) as AnthroTakes;

const FUTBOLISTA = single({
  bodyMass: 74.2, stature: 178.4, sittingHeight: 92.1,
  triceps: 7.5, subscapular: 9.0, biceps: 4.0, iliacCrest: 11.5, supraspinale: 7.0, abdominal: 12.0, frontThigh: 10.5, medialCalf: 6.0,
  armRelaxed: 30.5, armFlexed: 33.0, waist: 78.0, hip: 95.5, calf: 37.5, forearm: 27.5, chest: 96.0, midThigh: 55.5, head: 57.0,
  humerus: 7.0, wrist: 5.8, femur: 9.8, biacromial: 40.5, biiliocristal: 28.0, chestTransverse: 29.5, chestAP: 19.5,
});

const CORREDORA = single({
  bodyMass: 56.8, stature: 164.0, sittingHeight: 86.0,
  triceps: 12.0, subscapular: 9.5, biceps: 6.0, iliacCrest: 13.0, supraspinale: 8.5, abdominal: 14.0, frontThigh: 18.0, medialCalf: 10.0,
  armRelaxed: 26.0, armFlexed: 27.5, waist: 66.0, hip: 91.0, calf: 34.5, forearm: 23.5, chest: 84.0, midThigh: 51.0, head: 55.0,
  humerus: 6.0, wrist: 4.9, femur: 8.7, biacromial: 35.5, biiliocristal: 26.5, chestTransverse: 25.5, chestAP: 17.0,
});

function ok<T>(c: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!c.ok) throw new Error(c.reason);
  return c.value;
}

describe("tomas (ISAK)", () => {
  it("media de dos, mediana de tres", () => {
    expect(finalValue([10, 10.4])).toBeCloseTo(10.2);
    expect(finalValue([10, 11, 10.2])).toBe(10.2);
    expect(finalValue([74.2])).toBe(74.2);
    expect(finalValue([])).toBeNull();
  });

  it("pide la tercera toma: >5% en pliegues, >1% en el resto", () => {
    expect(needsThirdTake("triceps", [10, 10.4])).toBe(false); // 4%
    expect(needsThirdTake("triceps", [10, 10.6])).toBe(true); // 6%
    expect(needsThirdTake("armRelaxed", [30, 30.2])).toBe(false); // 0,67%
    expect(needsThirdTake("armRelaxed", [30, 30.5])).toBe(true); // 1,67%
  });

  it("al guardar, exige la tercera toma cuando corresponde y rechaza valores imposibles", () => {
    const base = { measuredAt: "2026-10-19" };
    expect(saveAnthropometrySchema.safeParse({ ...base, takes: { triceps: [10, 11] } }).success).toBe(false);
    expect(saveAnthropometrySchema.safeParse({ ...base, takes: { triceps: [10, 11, 10.5] } }).success).toBe(true);
    expect(saveAnthropometrySchema.safeParse({ ...base, takes: { stature: [17.8] } }).success).toBe(false);
    expect(saveAnthropometrySchema.safeParse({ ...base, takes: { inventado: [1] } }).success).toBe(false);
  });

  it("edad en años cumplidos", () => {
    expect(ageAt("2000-10-20", "2026-10-19")).toBe(25);
    expect(ageAt("2000-10-19", "2026-10-19")).toBe(26);
    expect(ageAt(null, "2026-10-19")).toBeNull();
  });
});

describe("caso futbolista (varón, 24 años)", () => {
  const r = anthropometryResults(FUTBOLISTA, { sex: "male", ageYears: 24 });

  it("Σ6, Σ8 y % graso", () => {
    expect(ok(r.sum6)).toBe(52.0);
    expect(ok(r.sum8)).toBe(67.5);
    expect(ok(r.fat.durninWomersley)).toBe(13.5);
    expect(ok(r.fat.yuhasz)).toBe(8.1);
    expect(ok(r.fat.faulkner)).toBe(11.2);
  });

  it("somatotipo Heath-Carter", () => {
    expect(ok(r.somatotype)).toMatchObject({ endo: 2.2, meso: 5.0, ecto: 2.5 });
  });

  it("Kerr 5 componentes (total dentro de ±5% del peso)", () => {
    const k = ok(r.kerr);
    expect(k).toMatchObject({ skinKg: 3.97, adiposeKg: 16.55, muscleKg: 36.61, residualKg: 8.62, boneKg: 8.61, totalKg: 74.36, diffPct: 0.2, muscleBoneIndex: 4.25 });
  });
});

describe("caso corredora (mujer, 31 años)", () => {
  const r = anthropometryResults(CORREDORA, { sex: "female", ageYears: 31 });

  it("Σ6, Σ8, % graso, somatotipo y Kerr", () => {
    expect(ok(r.sum6)).toBe(72.0);
    expect(ok(r.sum8)).toBe(91.0);
    expect(ok(r.fat.durninWomersley)).toBe(25.6);
    expect(ok(r.fat.yuhasz)).toBe(14.7);
    expect(ok(r.fat.faulkner)).toBe(12.5);
    expect(ok(r.somatotype)).toMatchObject({ endo: 3.2, meso: 3.7, ecto: 2.7 });
    expect(ok(r.kerr)).toMatchObject({ adiposeKg: 16.64, muscleKg: 23.3, boneKg: 6.16, totalKg: 54.52, diffPct: -4.0 });
  });
});

describe("lo que no se puede calcular, se explica", () => {
  it("sin el bloque de Kerr: el resto sí, Kerr dice qué falta", () => {
    const { forearm: _f, chest: _c, ...restricted } = FUTBOLISTA;
    const r = anthropometryResults(restricted, { sex: "male", ageYears: 24 });
    expect(r.sum6.ok).toBe(true);
    expect(r.somatotype.ok).toBe(true);
    expect(r.kerr).toMatchObject({ ok: false, reason: expect.stringContaining("Antebrazo") });
  });

  it("sin sexo binario o menor de 17: las ecuaciones por sexo/edad no aplican", () => {
    const sinSexo = anthropometryResults(FUTBOLISTA, { sex: null, ageYears: 24 });
    expect(sinSexo.fat.yuhasz.ok).toBe(false);
    expect(sinSexo.fat.faulkner.ok).toBe(true); // no depende del sexo
    const juvenil = anthropometryResults(FUTBOLISTA, { sex: "male", ageYears: 15 });
    expect(juvenil.fat.durninWomersley).toMatchObject({ ok: false, reason: expect.stringContaining("17") });
  });
});
