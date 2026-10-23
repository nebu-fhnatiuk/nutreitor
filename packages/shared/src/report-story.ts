/**
 * "Tu mes en números" (KAN-76): el reporte mensual publicado como historia vertical
 * (9:16) para compartir. Función pura: decide qué números van y con qué texto; la web
 * la dibuja en un canvas con los colores del club.
 *
 * Privacidad (ADR 0040): la historia sale del portal y se publica en redes, así que
 * sólo lleva hábitos (adherencia, días con registro, racha, consultas, energía).
 * Nunca peso, % grasa, cintura ni el comentario del profesional.
 */
import { monthLabel, type PatientReportDto } from "./dtos/report.dto.js";

export interface StoryStat {
  value: string;
  /** Unidad pegada al número ("%", "/5"). */
  unit?: string;
  label: string;
}

export interface StoryContent {
  /** "OCTUBRE 2026" */
  month: string;
  /** Nombre de pila del deportista. */
  firstName: string;
  club: string;
  hero: StoryStat;
  stats: StoryStat[];
  /** Nombre del archivo al descargar. */
  fileName: string;
}

/** Racha más larga de días seguidos (fechas YYYY-MM-DD, en cualquier orden, con repetidos). */
export function longestStreak(dates: string[]): number {
  const days = [...new Set(dates)].map((d) => Date.parse(`${d}T00:00:00Z`) / 86_400_000).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i]! - days[i - 1]! === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const dec = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });

/**
 * Qué muestra la historia. `null` si el reporte no está publicado o el mes no tiene
 * nada para contar (sin registros ni consultas): no se ofrece una historia vacía.
 * El número grande es la adherencia; si no hay, los días con registro.
 */
export function storyContent(
  report: Pick<PatientReportDto, "month" | "status" | "data">,
  who: { fullName: string; club: string },
): StoryContent | null {
  if (report.status !== "published") return null;
  const { adherence: a, checkins: c, appointments: ap } = report.data;
  const candidates: StoryStat[] = [];
  if (a.pct != null && a.logs > 0) candidates.push({ value: String(a.pct), unit: "%", label: "del plan cumplido" });
  if (a.daysLogged > 0) candidates.push({ value: String(a.daysLogged), label: plural(a.daysLogged, "día con registro", "días con registro") });
  const streak = a.longestStreak ?? 0;
  if (streak >= 2) candidates.push({ value: String(streak), label: "días seguidos, tu mejor racha" });
  if (ap.completed > 0) candidates.push({ value: String(ap.completed), label: plural(ap.completed, "consulta", "consultas") });
  if (c.count > 0 && c.energy != null) candidates.push({ value: dec(c.energy), unit: "/5", label: "de energía promedio" });
  if (!candidates.length) return null;

  const [hero, ...stats] = candidates;
  return {
    month: monthLabel(report.month).replace(" de ", " ").toUpperCase(),
    firstName: who.fullName.trim().split(/\s+/)[0] ?? "",
    club: who.club,
    hero: hero!,
    stats: stats.slice(0, 3),
    fileName: `mi-mes-${report.month}.png`,
  };
}
