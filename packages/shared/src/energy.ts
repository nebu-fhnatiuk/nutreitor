/**
 * Requerimiento energético y de macronutrientes con periodización deportiva
 * (ADR 0032). Funciones PURAS: las usan la API (al leer; nunca se guardan los
 * resultados) y la UI (vista previa mientras se carga).
 *
 *   gasto del día = GER × factor de actividad sin entrenamiento
 *                 + Σ (MET − 1) × peso × horas de cada sesión
 *   objetivo      = gasto del día × (1 + ajuste %)
 *   CHO y PRO en g/kg según el tipo de día; la grasa es el resto de la energía.
 *
 * Las sesiones suman MET − 1 porque el reposo ya está en el GER × factor (1 MET ≈
 * 1 kcal/kg/h). Rangos de referencia: posición ACSM/AND/DC (Thomas, Erdman y Burke,
 * 2016).
 */

import type { Calc } from "./anthropometry.js";

export type EnergySex = "female" | "male";

export const reeFormulas = ["mifflin", "harrisBenedict", "faoWho", "cunningham"] as const;
export type ReeFormula = (typeof reeFormulas)[number];

export const REE_FORMULA_LABEL: Record<ReeFormula, string> = {
  mifflin: "Mifflin-St Jeor (1990)",
  harrisBenedict: "Harris-Benedict revisada (Roza y Shizgal, 1984)",
  faoWho: "FAO/OMS/UNU (1985)",
  cunningham: "Cunningham (1980), con masa libre de grasa",
};

export interface EnergySubject {
  sex: EnergySex | null;
  ageYears: number | null;
  weightKg: number | null;
  heightCm: number | null;
  /** Masa libre de grasa (de la antropometría o cargada). Sólo la usa Cunningham. */
  ffmKg: number | null;
}

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

// ── Gasto energético en reposo (GER) ───────────────────────────────────────────

export function mifflin(s: EnergySubject): Calc<number> {
  if (!s.sex) return { ok: false, reason: "Mifflin-St Jeor necesita sexo femenino o masculino en la ficha." };
  if (s.weightKg == null || s.heightCm == null || s.ageYears == null) return { ok: false, reason: "Faltan peso, talla o edad." };
  const base = 10 * s.weightKg + 6.25 * s.heightCm - 5 * s.ageYears;
  return { ok: true, value: r0(base + (s.sex === "male" ? 5 : -161)) };
}

export function harrisBenedict(s: EnergySubject): Calc<number> {
  if (!s.sex) return { ok: false, reason: "Harris-Benedict necesita sexo femenino o masculino en la ficha." };
  if (s.weightKg == null || s.heightCm == null || s.ageYears == null) return { ok: false, reason: "Faltan peso, talla o edad." };
  const v =
    s.sex === "male"
      ? 88.362 + 13.397 * s.weightKg + 4.799 * s.heightCm - 5.677 * s.ageYears
      : 447.593 + 9.247 * s.weightKg + 3.098 * s.heightCm - 4.33 * s.ageYears;
  return { ok: true, value: r0(v) };
}

/** FAO/OMS/UNU 1985: por sexo y franja de edad, sólo con el peso. Cubre juveniles desde 3 años. */
const FAO: Record<EnergySex, { from: number; a: number; b: number }[]> = {
  male: [
    { from: 3, a: 22.7, b: 495 },
    { from: 10, a: 17.5, b: 651 },
    { from: 18, a: 15.3, b: 679 },
    { from: 30, a: 11.6, b: 879 },
    { from: 60, a: 13.5, b: 487 },
  ],
  female: [
    { from: 3, a: 22.5, b: 499 },
    { from: 10, a: 12.2, b: 746 },
    { from: 18, a: 14.7, b: 496 },
    { from: 30, a: 8.7, b: 829 },
    { from: 60, a: 10.5, b: 596 },
  ],
};

export function faoWho(s: EnergySubject): Calc<number> {
  if (!s.sex) return { ok: false, reason: "FAO/OMS necesita sexo femenino o masculino en la ficha." };
  if (s.weightKg == null || s.ageYears == null) return { ok: false, reason: "Faltan peso o edad." };
  if (s.ageYears < 3) return { ok: false, reason: "FAO/OMS se aplica desde los 3 años." };
  const band = [...FAO[s.sex]].reverse().find((x) => s.ageYears! >= x.from)!;
  return { ok: true, value: r0(band.a * s.weightKg + band.b) };
}

export function cunningham(s: EnergySubject): Calc<number> {
  if (s.ffmKg == null) return { ok: false, reason: "Cunningham necesita la masa libre de grasa (antropometría o carga manual)." };
  return { ok: true, value: r0(500 + 22 * s.ffmKg) };
}

const REE: Record<ReeFormula, (s: EnergySubject) => Calc<number>> = { mifflin, harrisBenedict, faoWho, cunningham };

export function ree(formula: ReeFormula, s: EnergySubject): Calc<number> {
  return REE[formula](s);
}

// ── Actividades (Compendio de Actividades Físicas, Ainsworth et al. 2011) ─────

export interface ActivityDef {
  key: string;
  label: string;
  met: number;
}

export const ACTIVITIES = [
  { key: "football_match", label: "Fútbol: partido", met: 10.0 },
  { key: "football_training", label: "Fútbol: entrenamiento", met: 7.0 },
  { key: "basketball_match", label: "Básquet: partido", met: 8.0 },
  { key: "basketball_training", label: "Básquet: entrenamiento", met: 6.0 },
  { key: "rugby_match", label: "Rugby: partido", met: 8.3 },
  { key: "rugby_training", label: "Rugby: entrenamiento", met: 6.3 },
  { key: "hockey_field", label: "Hockey sobre césped", met: 7.8 },
  { key: "handball", label: "Handball", met: 8.0 },
  { key: "volleyball", label: "Vóley competitivo", met: 6.0 },
  { key: "tennis_singles", label: "Tenis: singles", met: 8.0 },
  { key: "running_10", label: "Carrera a 10 km/h", met: 9.8 },
  { key: "running_12", label: "Carrera a 12 km/h", met: 11.8 },
  { key: "cycling_moderate", label: "Ciclismo 19–22 km/h", met: 8.0 },
  { key: "cycling_vigorous", label: "Ciclismo 22–25 km/h", met: 10.0 },
  { key: "swimming_moderate", label: "Natación: crol moderado", met: 5.8 },
  { key: "swimming_vigorous", label: "Natación: crol vigoroso", met: 9.8 },
  { key: "strength_vigorous", label: "Musculación vigorosa", met: 6.0 },
  { key: "strength_moderate", label: "Musculación moderada", met: 3.5 },
  { key: "circuit_hiit", label: "Circuito / HIIT / funcional", met: 8.0 },
  { key: "rowing", label: "Remo (ergómetro) moderado", met: 7.0 },
  { key: "boxing_sparring", label: "Boxeo: sparring", met: 7.8 },
  { key: "yoga", label: "Yoga / movilidad", met: 2.5 },
  { key: "walking", label: "Caminata a 5 km/h", met: 3.5 },
] as const satisfies readonly ActivityDef[];

export type ActivityKey = (typeof ACTIVITIES)[number]["key"];
export const activityKeys = ACTIVITIES.map((a) => a.key) as [ActivityKey, ...ActivityKey[]];

export interface EnergySession {
  /** Actividad del catálogo, o `custom` con su MET. */
  activity: ActivityKey | "custom";
  /** Para `custom`; en el catálogo se ignora. */
  met?: number | null;
  label?: string | null;
  minutes: number;
}

export function sessionMet(s: EnergySession): number | null {
  if (s.activity === "custom") return s.met ?? null;
  return ACTIVITIES.find((a) => a.key === s.activity)?.met ?? null;
}

/** Gasto neto de una sesión: (MET − 1) × peso × horas. */
export function sessionKcal(s: EnergySession, weightKg: number): number {
  const met = sessionMet(s);
  if (met == null || met <= 1) return 0;
  return (met - 1) * weightKg * (s.minutes / 60);
}

// ── Tipos de día y macros ─────────────────────────────────────────────────────

export interface EnergyDayType {
  id: string;
  name: string;
  sessions: EnergySession[];
  choGPerKg: number;
  proGPerKg: number;
}

export interface EnergyInputs {
  formula: ReeFormula;
  /** Factor de actividad SIN el entrenamiento (trabajo, estudio, vida diaria). */
  activityFactor: number;
  /** Ajuste del objetivo sobre el gasto: −10 = déficit del 10 %, +5 = superávit. */
  adjustmentPct: number;
  dayTypes: EnergyDayType[];
  /** Semana tipo: qué tipo de día es cada día (opcional). */
  week: Partial<Record<WeekdayKey, string>>;
}

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** Referencias ACSM/AND/DC 2016 (para mostrar, no se imponen). */
export const MACRO_REFERENCE = {
  cho: [
    { label: "Baja intensidad o habilidad", min: 3, max: 5 },
    { label: "Moderada (~1 h/día)", min: 5, max: 7 },
    { label: "Alta (1–3 h/día)", min: 6, max: 10 },
    { label: "Muy alta (>4–5 h/día)", min: 8, max: 12 },
  ],
  pro: { min: 1.2, max: 2.0 },
  fatPct: { min: 20, max: 35 },
} as const;

export interface DayTypeResult {
  id: string;
  name: string;
  baseKcal: number;
  exerciseKcal: number;
  expenditureKcal: number;
  targetKcal: number;
  choG: number;
  proG: number;
  fatG: number;
  fatGPerKg: number;
  fatPct: number;
  choPct: number;
  proPct: number;
  /** Avisos clínicos (no bloquean): grasa fuera de 20–35 %, CHO+PRO que se comen la energía. */
  warnings: string[];
}

/** Tipo de día para la tira de la semana (KAN-73): define el color, no el cálculo. */
export type DayKind = "match" | "training" | "rest";

const MATCH_RE = /partido|competencia|competición|torneo|carrera|match|juego/i;
const REST_RE = /descanso|libre|off|recuperaci[oó]n/i;

/**
 * Clasifica un tipo de día por su nombre (lo escribe el profesional) y, si se sabe,
 * por sus sesiones: sin sesiones es descanso. "Partido sábado" → partido.
 */
export function dayKind(name: string, sessions?: number): DayKind {
  if (MATCH_RE.test(name)) return "match";
  if (REST_RE.test(name) || sessions === 0) return "rest";
  return "training";
}

export interface EnergyResults {
  ree: Calc<number>;
  /** Todas las fórmulas, para comparar. */
  allRee: Record<ReeFormula, Calc<number>>;
  days: Calc<DayTypeResult[]>;
  /** Promedio de la semana tipo (kcal), si está armada. */
  weekAvgKcal: number | null;
}

export function dayTypeResult(d: EnergyDayType, reeKcal: number, inputs: EnergyInputs, weightKg: number): DayTypeResult {
  const baseKcal = reeKcal * inputs.activityFactor;
  const exerciseKcal = d.sessions.reduce((acc, s) => acc + sessionKcal(s, weightKg), 0);
  const expenditureKcal = baseKcal + exerciseKcal;
  const targetKcal = expenditureKcal * (1 + inputs.adjustmentPct / 100);
  const choG = d.choGPerKg * weightKg;
  const proG = d.proGPerKg * weightKg;
  const fatG = Math.max(0, (targetKcal - 4 * choG - 4 * proG) / 9);
  const pct = (kcal: number) => (targetKcal > 0 ? (kcal / targetKcal) * 100 : 0);
  const fatPct = pct(9 * fatG);
  const warnings: string[] = [];
  if (4 * choG + 4 * proG > targetKcal) {
    warnings.push("Carbohidratos y proteínas superan la energía del día: no queda lugar para la grasa.");
  } else if (fatPct < MACRO_REFERENCE.fatPct.min) {
    warnings.push(`La grasa queda en ${r0(fatPct)} % de la energía (referencia 20–35 %).`);
  } else if (fatPct > MACRO_REFERENCE.fatPct.max) {
    warnings.push(`La grasa queda en ${r0(fatPct)} % de la energía (referencia 20–35 %).`);
  }
  return {
    id: d.id,
    name: d.name,
    baseKcal: r0(baseKcal),
    exerciseKcal: r0(exerciseKcal),
    expenditureKcal: r0(expenditureKcal),
    targetKcal: r0(targetKcal),
    choG: r0(choG),
    proG: r0(proG),
    fatG: r0(fatG),
    fatGPerKg: r1(fatG / weightKg),
    fatPct: r0(fatPct),
    choPct: r0(pct(4 * choG)),
    proPct: r0(pct(4 * proG)),
    warnings,
  };
}

export function energyResults(inputs: EnergyInputs, s: EnergySubject): EnergyResults {
  const allRee = Object.fromEntries(reeFormulas.map((f) => [f, ree(f, s)])) as Record<ReeFormula, Calc<number>>;
  const chosen = allRee[inputs.formula];
  if (!chosen.ok) return { ree: chosen, allRee, days: chosen, weekAvgKcal: null };
  if (s.weightKg == null) {
    const why = { ok: false as const, reason: "Falta el peso." };
    return { ree: chosen, allRee, days: why, weekAvgKcal: null };
  }
  const days = inputs.dayTypes.map((d) => dayTypeResult(d, chosen.value, inputs, s.weightKg!));
  const byId = new Map(days.map((d) => [d.id, d]));
  const weekDays = Object.values(inputs.week)
    .map((id) => (id ? byId.get(id) : undefined))
    .filter((d): d is DayTypeResult => d !== undefined);
  const weekAvgKcal = weekDays.length === 7 ? r0(weekDays.reduce((a, d) => a + d.targetKcal, 0) / 7) : null;
  return { ree: chosen, allRee, days: { ok: true, value: days }, weekAvgKcal };
}

/** Macros de un tipo de día con la forma de `targets` del plan alimentario. */
export function dayTypeTargets(d: DayTypeResult): { kcal: number; protein_g: number; carbs_g: number; fat_g: number } {
  return { kcal: d.targetKcal, protein_g: d.proG, carbs_g: d.choG, fat_g: d.fatG };
}
