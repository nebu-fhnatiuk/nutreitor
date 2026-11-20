/**
 * Motor de alertas clínico-nutricionales sobre el plan (KAN-97, épica KAN-91).
 *
 * Reglas determinísticas, sin LLM: revisan el PLAN PRESCRIPTO (no la ingesta real)
 * contra el requerimiento (ADR 0032) y la masa libre de grasa. Las alertas no
 * bloquean: informan, y el profesional las acepta o las descarta.
 *
 * Implementa la sección A (alergias e intolerancias, validada en
 * docs/validation/alergenos.md) y la sección C (energía y macros, validada en
 * docs/validation/alertas.md). Los umbrales viven en
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
import type { EnergyRequirementDto } from "./dtos/energy.dto.js";
import { ALLERGEN_LABEL, ALLERGY_FLAG_TAG, type AllergenKey, type AllergyFlag } from "./allergens.js";
import { planAlertRules, type PlanAlertLevel, type PlanAlertRule } from "./plan-alert-rules.js";

export * from "./plan-alert-rules.js";

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
  caa: "Código Alimentario Argentino, art. 235 séptimo (alérgenos)",
  celiac: "Ley 26.588 y Código Alimentario Argentino, art. 1383 (alimentos libres de gluten)",
  lactose: "EFSA NDA Panel, 2010 (umbrales de lactosa en la intolerancia)",
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
  /**
   * Casillas de alergias e intolerancias de la ficha (KAN-105). `null` = no se
   * conocen (sin acceso clínico o sin cargar todavía): no se evalúa la sección A.
   */
  allergyFlags?: AllergyFlag[] | null;
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
/** g/kg con un decimal fijo: "1,0", "1,2–2,0". */
const fmtGPerKg = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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

// ── Sección A · alergias e intolerancias ─────────────────────────────────────

/** "Maní" → "maní", "Gluten (TACC)" → "gluten (TACC)". */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const listEs = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);

interface PlanItemRef {
  meal: string;
  name: string;
  /** null = no se conocen (texto libre, o vinculado antes de que existiera el dato). */
  allergens: AllergenKey[] | null;
}

function itemsOf(day: DayPlan): PlanItemRef[] {
  return day.meals.flatMap((m) =>
    m.items.map((it) => ({ meal: m.name, name: it.text, allergens: it.food?.allergens ?? null })),
  );
}

function allergenAlerts(d: DayToCheck, flags: AllergyFlag[]): PlanAlert[] {
  const out: PlanAlert[] = [];
  const add = (rule: PlanAlertRule, level: PlanAlertLevel, value: number, message: string, source: string) =>
    out.push({ rule, level, day: d.key, dayLabel: d.label, message, source, value });
  const items = itemsOf(d.plan).filter((i) => i.allergens?.length);

  // A1 · alérgeno tildado como alergia
  const allergyTags = new Set(flags.filter((f) => f !== "celiaquia" && f !== "intolerancia_lactosa").map((f) => ALLERGY_FLAG_TAG[f]));
  const a1 = new Map<string, AllergenKey[]>();
  for (const i of items) {
    const hit = i.allergens!.filter((k) => allergyTags.has(k));
    if (hit.length) a1.set(i.name, [...new Set([...(a1.get(i.name) ?? []), ...hit])]);
  }
  if (a1.size === 1 && [...a1.values()][0]!.length === 1) {
    const [[name, [k]]] = [...a1.entries()] as [[string, [AllergenKey]]];
    const label = lowerFirst(ALLERGEN_LABEL[k]);
    add("A1", "important", 1, `El plan incluye ${name}, que contiene ${label}. En la ficha figura alergia a ${label}.`, SOURCE.caa);
  } else if (a1.size) {
    const parts = [...a1.entries()].map(([name, ks]) => `${name} (${ks.map((k) => lowerFirst(ALLERGEN_LABEL[k])).join(", ")})`);
    add("A1", "important", a1.size, `El plan incluye ${listEs(parts)}: alimentos con alérgenos que figuran en la ficha.`, SOURCE.caa);
  }

  // A2 · celiaquía y gluten
  if (flags.includes("celiaquia")) {
    const names = [...new Set(items.filter((i) => i.allergens!.includes("tacc")).map((i) => i.name))];
    if (names.length) {
      const verb = names.length === 1 ? "contiene" : "contienen";
      add("A2", "important", names.length, `${listEs(names)} ${verb} gluten (TACC). En la ficha figura celiaquía.`, SOURCE.celiac);
    }
  }

  // A3 · intolerancia a la lactosa, una alerta por día que agrupa las comidas
  if (flags.includes("intolerancia_lactosa")) {
    const byMeal = new Map<string, string[]>();
    for (const i of items.filter((i) => i.allergens!.includes("lactosa"))) {
      byMeal.set(i.meal, [...new Set([...(byMeal.get(i.meal) ?? []), i.name])]);
    }
    if (byMeal.size) {
      const tail = "Con intolerancia suele tolerarse hasta unos 12 g por toma.";
      const message =
        byMeal.size === 1
          ? `La comida ${[...byMeal.keys()][0]} incluye ${listEs([...byMeal.values()][0]!)} con lactosa. ${tail}`
          : `Las comidas ${listEs([...byMeal.entries()].map(([m, ns]) => `${m} (${ns.join(", ")})`))} incluyen alimentos con lactosa. ${tail}`;
      add("A3", "info", byMeal.size, message, SOURCE.lactose);
    }
  }
  return out;
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
      add("C4", "info", Math.round(g * 10) / 10, `El plan aporta ${fmtGPerKg(g)} g/kg de proteína; la referencia para deportistas es ${fmtGPerKg(t.proteinGPerKg.min)}–${fmtGPerKg(t.proteinGPerKg.max)} g/kg.`, SOURCE.acsm);
    }
  }

  // C5 · hidratos según la carga del día (solo con tipo de día del requerimiento)
  if (totals.carbs_g != null && weight != null && weight > 0 && d.dayType) {
    const minutes = d.dayType.sessions.reduce((acc, s) => acc + s.minutes, 0);
    const band = carbBand(minutes);
    const g = totals.carbs_g / weight;
    if (g < band.min || g > band.max) {
      add("C5", "info", Math.round(g * 10) / 10, `El día aporta ${fmtGPerKg(g)} g/kg de hidratos; para ${minutes} min de entrenamiento la referencia es ${band.min}–${band.max} g/kg.`, SOURCE.acsm);
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

  const flags = ctx.allergyFlags ?? null;
  if (flags === null) missing.push("No se conocen las alergias de la ficha: no se evalúan alergias ni intolerancias.");

  const alerts: PlanAlert[] = [];
  const notEvaluated: PlanAlertsResult["notEvaluated"] = [];
  const days = daysToCheck(body, ctx.energy, results);
  if (flags?.length) {
    const unknown = days.flatMap((d) => itemsOf(d.plan)).filter((i) => i.allergens === null).length;
    if (unknown) {
      missing.push(
        `${unknown} ${unknown === 1 ? "alimento no tiene" : "alimentos no tienen"} datos de alérgenos (texto libre o vinculados antes): no se revisan contra las alergias de la ficha.`,
      );
    }
  }
  for (const d of days) {
    // Sección A: no depende de las kcal, se evalúa siempre.
    if (flags?.length) alerts.push(...allergenAlerts(d, flags));
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

/** Clave estable de una alerta dentro de un plan: una regla por día. */
export const planAlertKey = (a: { rule: PlanAlertRule; day: Weekday | "day" }) => `${a.rule}:${a.day}`;

/**
 * Contexto de las alertas a partir del último requerimiento del deportista: el peso,
 * la talla y la masa libre de grasa usados ahí, y sus tipos de día. Lo usan el
 * editor (para mostrarlas) y la API (para registrarlas al guardar): mismo cálculo.
 */
export function planAlertContextFrom(
  req: EnergyRequirementDto | null,
  allergyFlags: AllergyFlag[] | null = null,
): PlanAlertContext {
  if (!req) {
    return { subject: { sex: null, ageYears: null, weightKg: null, heightCm: null, ffmKg: null }, energy: null, allergyFlags };
  }
  return {
    allergyFlags,
    subject: { sex: req.sex, ageYears: req.ageYears, weightKg: req.weightKg, heightCm: req.heightCm ?? null, ffmKg: req.ffmKg ?? null },
    energy: {
      formula: req.formula,
      activityFactor: req.activityFactor,
      adjustmentPct: req.adjustmentPct,
      dayTypes: req.dayTypes,
      week: req.week,
    },
  };
}
