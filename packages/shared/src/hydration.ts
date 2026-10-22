/**
 * Hidratación: prueba de sudoración y plan de líquidos (ADR 0036). Funciones PURAS:
 * API (al leer) y UI (vista previa).
 *
 *   pérdida de peso (kg)  = peso antes − peso después
 *   sudor (L)             = pérdida de peso + líquido tomado (L) − orina (L)
 *   tasa de sudoración    = sudor ÷ horas
 *   deshidratación (%)    = pérdida de peso ÷ peso antes × 100
 *
 * 1 kg de peso ≈ 1 L de sudor. Referencias del plan (a validar por la nutricionista):
 * ACSM 2007 (posición sobre ejercicio y reposición de líquidos) y Shirreffs 1996 para
 * la reposición posterior.
 */

export interface SweatTestInput {
  preWeightKg: number;
  postWeightKg: number;
  durationMin: number;
  fluidIntakeMl: number;
  urineMl: number;
}

export interface SweatTestResults {
  weightLossKg: number;
  sweatLossL: number;
  sweatRateLh: number;
  /** % del peso antes; negativo = ganó peso. */
  dehydrationPct: number;
  /** Cuánto del sudor repuso con lo que tomó (%). */
  replacementPct: number | null;
  warnings: string[];
  plan: FluidPlan;
}

export interface FluidPlan {
  /** 5–7 ml/kg unas 4 h antes (ACSM 2007). */
  beforeMl: [number, number];
  /** ml/h durante para no superar el 2 % de pérdida en una sesión igual. */
  duringMlPerHour: number;
  /** 1,25–1,5 L por kg perdido, en las horas siguientes (Shirreffs 1996). */
  afterMl: [number, number];
  /** Sugerir sodio: sesión larga (≥ 2 h) o tasa de sudoración alta (≥ 1,2 L/h). */
  suggestSodium: boolean;
}

/** Umbral de pérdida a partir del cual baja el rendimiento (ACSM 2007). */
export const DEHYDRATION_THRESHOLD_PCT = 2;

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const round50 = (ml: number) => Math.max(0, Math.round(ml / 50) * 50);

export function sweatTestResults(i: SweatTestInput): SweatTestResults {
  const hours = i.durationMin / 60;
  const weightLossKg = i.preWeightKg - i.postWeightKg;
  const sweatLossL = weightLossKg + i.fluidIntakeMl / 1000 - i.urineMl / 1000;
  const sweatRateLh = hours > 0 ? sweatLossL / hours : 0;
  const dehydrationPct = (weightLossKg / i.preWeightKg) * 100;
  const replacementPct = sweatLossL > 0 ? (i.fluidIntakeMl / 1000 / sweatLossL) * 100 : null;

  const warnings: string[] = [];
  if (dehydrationPct > DEHYDRATION_THRESHOLD_PCT) {
    warnings.push(`Perdió ${String(r1(dehydrationPct)).replace(".", ",")} % del peso: por encima del 2 % baja el rendimiento.`);
  }
  if (weightLossKg < 0) {
    warnings.push("Ganó peso: tomó más de lo que sudó. En sesiones largas hay riesgo de hiponatremia.");
  }
  if (sweatLossL <= 0) {
    warnings.push("La pérdida de sudor da cero o negativa: revisá los pesos y lo tomado.");
  }

  // Para que una sesión igual termine con, como mucho, 2 % de pérdida.
  const allowedLossL = (DEHYDRATION_THRESHOLD_PCT / 100) * i.preWeightKg;
  const duringMlPerHour = hours > 0 ? round50((Math.max(0, sweatLossL - allowedLossL) / hours) * 1000) : 0;
  const lossForAfter = Math.max(0, weightLossKg);

  return {
    weightLossKg: r2(weightLossKg),
    sweatLossL: r2(sweatLossL),
    sweatRateLh: r2(sweatRateLh),
    dehydrationPct: r1(dehydrationPct),
    replacementPct: replacementPct == null ? null : r0(replacementPct),
    warnings,
    plan: {
      beforeMl: [round50(5 * i.preWeightKg), round50(7 * i.preWeightKg)],
      duringMlPerHour,
      afterMl: [round50(1250 * lossForAfter), round50(1500 * lossForAfter)],
      suggestSodium: i.durationMin >= 120 || sweatRateLh >= 1.2,
    },
  };
}
