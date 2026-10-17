/**
 * Formato de fecha/hora para la UI. Los instantes vienen en UTC (ISO); acá se
 * muestran en el huso del NAVEGADOR (el del que mira), que es justo lo que se
 * quiere: el paciente ve los turnos en su hora local. es-AR.
 */

export function fmtTime(iso: string): string {
  // 24 h, como se usa en Argentina ("09:00", no "09:00 a. m.").
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Encabezado de día: "lunes 8 de junio", con "Hoy · " / "Mañana · " delante cuando
 * corresponde y el año sólo si no es el actual ("lunes 3 de marzo de 2031"): sin
 * año, un turno de otro año parecía de este.
 */
export function fmtDayLong(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const base = d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  });
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return `Hoy · ${base}`;
  if (key === dayKey(new Date(now.getTime() + 24 * 3600 * 1000).toISOString())) return `Mañana · ${base}`;
  return base;
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
