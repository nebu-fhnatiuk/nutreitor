/**
 * Pizarra del plantel (KAN-70): un semáforo por deportista a partir de lo que ya
 * se mide (antropometría, prueba de sudoración, adherencia). Función pura: la API
 * junta los datos y esto decide la zona y el orden. Los umbrales son referencias
 * de trabajo a confirmar por la nutricionista (docs/validation/pizarra-plantel.md).
 */
import { daysBetween } from "./dtos/adherence.dto.js";

export type BoardZone = "ok" | "warn" | "bad";

export const BOARD_THRESHOLDS = {
  /** Días sin antropometría a partir de los cuales hay que volver a medir. */
  staleDays: 30,
  /** Pérdida de peso en la última prueba de sudoración (%): límite y fuera. */
  lossWarnPct: 2,
  lossBadPct: 3,
  /** Suba de Σ6 contra la medición anterior (mm) que ya no es error de medición. */
  sum6RiseMm: 2,
  /** Caída de adherencia (puntos) de la semana anterior a esta. */
  adherenceDropPts: 15,
  /** Adherencia de la última semana por debajo de la cual está fuera. */
  adherenceLowPct: 50,
} as const;

export interface BoardInput {
  /** Fecha (YYYY-MM-DD) de la última antropometría, o null si nunca se midió. */
  lastMeasuredOn: string | null;
  sum6Delta: number | null;
  /** % de peso perdido en la última prueba de sudoración. */
  lossPct: number | null;
  /** Adherencia de los últimos 7 días y de los 7 anteriores (null = sin registros). */
  adherence7: number | null;
  adherencePrev7: number | null;
}

export type BoardFlagKind = "unmeasured" | "stale" | "dehydration" | "sum6Up" | "adherenceLow" | "adherenceDown";

export interface BoardFlag {
  kind: BoardFlagKind;
  zone: Exclude<BoardZone, "ok">;
  text: string;
}

export interface BoardStatus {
  zone: BoardZone;
  /** Ordenadas de más a menos grave; la primera es el titular de la tarjeta. */
  flags: BoardFlag[];
  daysSinceMeasured: number | null;
}

const T = BOARD_THRESHOLDS;
const dec = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });

export function boardStatus(i: BoardInput, today: string): BoardStatus {
  const flags: BoardFlag[] = [];
  const days = i.lastMeasuredOn ? daysBetween(i.lastMeasuredOn, today) : null;

  if (i.lossPct !== null && i.lossPct > T.lossWarnPct) {
    flags.push({
      kind: "dehydration",
      zone: i.lossPct > T.lossBadPct ? "bad" : "warn",
      text: `Perdió ${dec(i.lossPct)} % entrenando`,
    });
  }
  if (i.adherence7 !== null && i.adherence7 < T.adherenceLowPct) {
    flags.push({ kind: "adherenceLow", zone: "bad", text: `Adherencia ${i.adherence7} %` });
  } else if (
    i.adherence7 !== null &&
    i.adherencePrev7 !== null &&
    i.adherencePrev7 - i.adherence7 >= T.adherenceDropPts
  ) {
    flags.push({
      kind: "adherenceDown",
      zone: "warn",
      text: `Adherencia bajó ${i.adherencePrev7 - i.adherence7} puntos`,
    });
  }
  if (i.sum6Delta !== null && i.sum6Delta >= T.sum6RiseMm) {
    flags.push({ kind: "sum6Up", zone: "warn", text: `Σ6 subió ${dec(i.sum6Delta)} mm` });
  }
  if (days === null) {
    flags.push({ kind: "unmeasured", zone: "warn", text: "Sin antropometría" });
  } else if (days > T.staleDays) {
    flags.push({ kind: "stale", zone: "warn", text: `Sin medir hace ${days} días` });
  }

  flags.sort((a, b) => rank(b.zone) - rank(a.zone));
  return { zone: flags[0]?.zone ?? "ok", flags, daysSinceMeasured: days };
}

const rank = (z: BoardZone) => (z === "bad" ? 2 : z === "warn" ? 1 : 0);

/**
 * Orden de la pizarra: quién necesita atención primero (fuera → límite → en rango),
 * dentro de cada zona por cantidad de avisos y después por nombre.
 */
export function compareBoard(
  a: { fullName: string; status: BoardStatus },
  b: { fullName: string; status: BoardStatus },
): number {
  return (
    rank(b.status.zone) - rank(a.status.zone) ||
    b.status.flags.length - a.status.flags.length ||
    a.fullName.localeCompare(b.fullName, "es")
  );
}
