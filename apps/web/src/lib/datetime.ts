/**
 * Formato de fecha/hora para la UI. Los instantes vienen en UTC (ISO); acá se
 * muestran en el huso del NAVEGADOR (el del que mira), que es justo lo que se
 * quiere: el paciente ve los turnos en su hora local. es-AR.
 */

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Encabezado de día: "lunes 8 de junio". */
export function fmtDayLong(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Clave de día local (YYYY-MM-DD) para agrupar slots/citas por jornada. */
export function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

/** Huso del navegador (ej. America/Argentina/Buenos_Aires), para mostrarlo. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** Agrupa items con campo `startsAt` por día local, preservando el orden. */
export function groupByDay<T extends { startsAt: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = dayKey(it.startsAt);
    (map.get(k) ?? map.set(k, []).get(k)!).push(it);
  }
  return [...map.entries()];
}
