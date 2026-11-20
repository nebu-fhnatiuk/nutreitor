/**
 * Motor de alertas clínico-nutricionales sobre el plan (KAN-97, épica KAN-91).
 *
 * Reglas determinísticas, sin LLM: revisan el PLAN PRESCRIPTO (no la ingesta real)
 * contra el requerimiento (ADR 0032) y la masa libre de grasa. Las alertas no
 * bloquean: informan, y el profesional las acepta o las descarta.
 *
 * Por ahora implementa la sección C del catálogo (energía y macros), validada por la
 * nutricionista en docs/validation/alertas.md. Los umbrales viven en
 * `PLAN_ALERT_THRESHOLDS`: cambiar uno es editar ahí y actualizar los tests.
 */

import {
  dayKind,
  energyResults,
  MACRO_REFERENCE,
  type DayTypeResult,
  type EnergyDayType,
  type EnergyInputs,
  type EnergySubject,
} from "./energy.js";
import {
  dayMacros,
  macroCoverage,
  weekdays,
  type DayPlan,
  type Macros,
  type MealPlanBody,
  type Weekday,
} from "./dtos/meal-plan.dto.js";

export const planAlertRules = ["C1", "C2", "C3", "C4", "C5", "C6"] as const;
export type PlanAlertRule = (typeof planAlertRules)[number];
export type PlanAlertLevel = "important" | "info";

export const PLAN_ALERT_THRESHOLDS = {
  /** C1: desvío de kcal frente al objetivo del día, en %. */
  kcalTolerancePct: 10,
  kcalToleranceRestPct: 15,
  /** C2 y C3: disponibilidad energética, kcal/kg de masa libre de grasa por día. */
  energyAvailabilityLow: 30,
  energyAvailabilityOptimal: 45,
  /** C4 y C6: referencias ACSM/AND/DC 2016 (las mismas del requerimiento). */
  proteinGPerKg: MACRO_REFERENCE.pro,
  fatPct: MACRO_REFERENCE.fatPct,
  /**
   * C5: banda de hidratos según los minutos de entrenamiento del tipo de día. Cada
   * banda aplica hasta `maxMinutes` inclusive. Criterio de la app, a confirmar.
   */
  carbBands: [
    { maxMinutes: 0, band: MACRO_REFERENCE.cho[0] },
    { maxMinutes: 60, band: MACRO_REFERENCE.cho[1] },
    { maxMinutes: 240, band: MACRO_REFERENCE.cho[2] },
    { maxMinutes: Infinity, band: MACRO_REFERENCE.cho[3] },
  ],
} as const;

const SOURCE = {
  app: "Criterio de la app",
  acsm: "Thomas, Erdman y Burke, 2016 (posición ACSM, AND y Dietitians of Canada)",
  reds: "Mountjoy et al., 2023 (consenso del COI sobre REDs, BJSM)",
} as const;

export interface PlanAlert {
  rule: PlanAlertRule;
  level: PlanAlertLevel;
  /** Día del plan: un día de la semana, o `day` en un plan de día-tipo. */
  day: Weekday | "day";
  dayLabel: string;
  message: string;
  source: string;
  /** Valor que disparó la alerta (en la unidad de la regla), para ordenar o mostrar. */
  value: number;
}

export interface PlanAlertsResult {
  alerts: PlanAlert[];
  /** Días que no se pudieron evaluar (por ejemplo, alimentos sin kcal). */
  notEvaluated: { day: Weekday | "day"; dayLabel: string; reason: string }[];
  /** Datos que faltan y dejan reglas sin evaluar en todo el plan. */
  missing: string[];
}

export interface PlanAlertContext {
  /** Peso, masa libre de grasa, sexo, edad y talla (los mismos del requerimiento). */
  subject: EnergySubject;
  /** Requerimiento con tipos de día y semana tipo; null si no está cargado. */
  energy: EnergyInputs | null;
}

const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

const fmt = (n: number, digits = 1) => n.toLocaleString("es-AR", { maximumFractionDigits: digits });

interface DayToCheck {
  key: Weekday | "day";
  label: string;
  plan: DayPlan;
  targetKcal: number | undefined;
  dayType: EnergyDayType | null;
  dayResult: DayTypeResult | null;
  /** Nombre del tipo de día, para decidir si es descanso cuando no hay requerimiento. */
  dayTypeName: string | null;
}

function daysToCheck(body: MealPlanBody, energy: EnergyInputs | null, results: DayTypeResult[]): DayToCheck[] {
  if (body.layout === "day") {
    return [
      { key: "day", label: "Día tipo", plan: body.day, targetKcal: body.targets?.kcal, dayType: null, dayResult: null, dayTypeName: null },
    ];
  }
  return weekdays
    .filter((wd) => body.days[wd]?.meals.length)
    .map((wd) => {
      const typeId = energy?.week[wd];
      const dayType = energy?.dayTypes.find((d) => d.id === typeId) ?? null;
      const dayTypeName = dayType?.name ?? body.dayLabels?.[wd] ?? null;
      return {
        key: wd,
        label: dayTypeName ? `${WEEKDAY_LABEL[wd]} · ${dayTypeName}` : WEEKDAY_LABEL[wd],
        plan: body.days[wd]!,
        targetKcal: body.dayTargets?.[wd]?.kcal ?? body.targets?.kcal,
        dayType,
        dayResult: results.find((r) => r.id === typeId) ?? null,
        dayTypeName,
      };
    });
}

function isRestDay(d: DayToCheck): boolean {
  if (d.dayType) return dayKind(d.dayType.name, d.dayType.sessions.length) === "rest";
  return d.dayTypeName ? dayKind(d.dayTypeName) === "rest" : false;
}

function carbBand(minutes: number) {
  return PLAN_ALERT_THRESHOLDS.carbBands.find((b) => minutes <= b.maxMinutes)!.band;
}

function checkDay(d: DayToCheck, totals: Macros, ctx: PlanAlertContext): PlanAlert[] {
  const t = PLAN_ALERT_THRESHOLDS;
  const out: PlanAlert[] = [];
  const add = (rule: PlanAlertRule, level: PlanAlertLevel, value: number, message: string, source: string) =>
    out.push({ rule, level, day: d.key, dayLabel: d.label, message, source, value });

  const kcal = totals.kcal;
  const weight = ctx.subject.weightKg;
  const ffm = ctx.subject.ffmKg;

  // C1 · energía frente al objetivo del día
  if (kcal != null && d.targetKcal != null && d.targetKcal > 0) {
    const dev = ((kcal - d.targetKcal) / d.targetKcal) * 100;
    const tol = isRestDay(d) ? t.kcalToleranceRestPct : t.kcalTolerancePct;
    if (Math.abs(dev) > tol) {
      const sign = dev > 0 ? "+" : "−";
      add("C1", "info", Math.round(dev), `El plan aporta ${fmt(kcal, 0)} kcal; el objetivo del día es ${fmt(d.targetKcal, 0)} kcal (${sign}${fmt(Math.abs(dev), 0)} %).`, SOURCE.app);
    }
  }

  // C2 y C3 · disponibilidad energética
  if (kcal != null && ffm != null && ffm > 0 && d.dayResult) {
    const ea = (kcal - d.dayResult.exerciseKcal) / ffm;
    if (ea < t.energyAvailabilityLow) {
      add("C2", "important", Math.round(ea * 10) / 10, `Disponibilidad energética estimada de ${fmt(ea)} kcal/kg MLG. Por debajo de ${t.energyAvailabilityLow} hay riesgo de REDs.`, SOURCE.reds);
    } else if (ea < t.energyAvailabilityOptimal && (ctx.energy?.adjustmentPct ?? 0) >= 0) {
      add("C3", "info", Math.round(ea * 10) / 10, `Disponibilidad energética estimada de ${fmt(ea)} kcal/kg MLG: por debajo del nivel óptimo (${t.energyAvailabilityOptimal}).`, SOURCE.reds);
    }
  }

  // C4 · proteína por kg
  if (totals.protein_g != null && weight != null && weight > 0) {
    const g = totals.protein_g / weight;
    if (g < t.proteinGPerKg.min || g > t.proteinGPerKg.max) {
      add("C4", "info", Math.round(g * 10) / 10, `El plan aporta ${fmt(g)} g/kg de proteína; la referencia para deportistas es ${fmt(t.proteinGPerKg.min)}–${fmt(t.proteinGPerKg.max)} g/kg.`, SOURCE.acsm);
    }
  }

  // C5 · hidratos según la carga del día (solo con tipo de día del requerimiento)
  if (totals.carbs_g != null && weight != null && weight > 0 && d.dayType) {
    const minutes = d.dayType.sessions.reduce((acc, s) => acc + s.minutes, 0);
    const band = carbBand(minutes);
    const g = totals.carbs_g / weight;
    if (g < band.min || g > band.max) {
      add("C5", "info", Math.round(g * 10) / 10, `El día aporta ${fmt(g)} g/kg de hidratos; para ${minutes} min de entrenamiento la referencia es ${band.min}–${band.max} g/kg.`, SOURCE.acsm);
    }
  }

  // C6 · grasa en % de la energía
  if (totals.fat_g != null && kcal != null && kcal > 0) {
    const pct = ((totals.fat_g * 9) / kcal) * 100;
    if (pct < t.fatPct.min || pct > t.fatPct.max) {
      add("C6", "info", Math.round(pct), `La grasa aporta el ${fmt(pct, 0)} % de la energía; la referencia es ${t.fatPct.min}–${t.fatPct.max} %.`, SOURCE.acsm);
    }
  }

  return out;
}

/** Revisa un plan contra el requerimiento y la ficha. Función pura. */
export function planAlerts(body: MealPlanBody, ctx: PlanAlertContext): PlanAlertsResult {
  const missing: string[] = [];
  if (ctx.subject.weightKg == null) missing.push("Falta el peso: no se evalúan proteína ni hidratos por kg.");
  if (ctx.subject.ffmKg == null) missing.push("Falta la masa libre de grasa (antropometría): no se evalúa la disponibilidad energética.");
  if (!ctx.energy) missing.push("Falta el requerimiento: no se evalúan la disponibilidad energética ni los hidratos según la carga.");
  else if (body.layout === "day") missing.push("Plan de día-tipo: sin semana tipo no se evalúan la disponibilidad energética ni los hidratos según la carga.");

  let results: DayTypeResult[] = [];
  if (ctx.energy) {
    const r = energyResults(ctx.energy, ctx.subject);
    if (r.days.ok) results = r.days.value;
    else missing.push(`No se pudo calcular el requerimiento: ${r.days.reason}`);
  }

  const alerts: PlanAlert[] = [];
  const notEvaluated: PlanAlertsResult["notEvaluated"] = [];
  for (const d of daysToCheck(body, ctx.energy, results)) {
    const coverage = macroCoverage(d.plan);
    const totals = dayMacros(d.plan);
    if (!coverage.complete || !totals) {
      notEvaluated.push({
        day: d.key,
        dayLabel: d.label,
        reason: `Faltan las kcal de ${coverage.items - coverage.withKcal} de ${coverage.items} alimentos: el total del día sería parcial.`,
      });
      continue;
    }
    alerts.push(...checkDay(d, totals, ctx));
  }

  const dayOrder = (k: Weekday | "day") => (k === "day" ? -1 : weekdays.indexOf(k));
  alerts.sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === "important" ? -1 : 1) ||
      dayOrder(a.day) - dayOrder(b.day) ||
      planAlertRules.indexOf(a.rule) - planAlertRules.indexOf(b.rule),
  );
  return { alerts, notEvaluated, missing };
}
