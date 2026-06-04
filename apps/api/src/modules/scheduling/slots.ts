import type { SlotDto } from "@nutreitor/shared";
import { DateTime } from "luxon";

/** Ventana de disponibilidad en el huso del profesional (minutos desde medianoche). */
export interface AvailabilityRuleInput {
  timezone: string; // IANA
  weekday: number; // ISO 1=lunes … 7=domingo
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
}
export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Genera los slots LIBRES en el rango [from, to), a partir de las ventanas de
 * disponibilidad semanal (en el huso del profesional) menos lo ocupado.
 *
 * El huso/DST lo resuelve Luxon: cada slot se ancla a su hora de PARED en el huso
 * de la regla (DateTime.set en esa zona) y se convierte a UTC. El fin es
 * `inicio + slotMinutes` REALES (la duración de la cita no se estira por DST). Se
 * descartan: slots pasados (< now), fuera del rango, en hueco de DST, u ocupados.
 */
export function generateSlots(opts: {
  rules: AvailabilityRuleInput[];
  busy: BusyInterval[];
  from: Date;
  to: Date;
  now?: Date;
}): SlotDto[] {
  const { rules, busy, from, to } = opts;
  const nowMs = (opts.now ?? from).getTime();
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const busyMs = busy.map((b) => [b.startsAt.getTime(), b.endsAt.getTime()] as const);

  const seen = new Set<number>();
  const out: { s: number; e: number }[] = [];

  for (const rule of rules) {
    // Iterar día por día en el huso del profesional (DST-safe: plus({days}) mantiene
    // la hora de pared). El rango se ensancha a días completos para no perder bordes.
    let day = DateTime.fromJSDate(from, { zone: "utc" }).setZone(rule.timezone).startOf("day");
    const last = DateTime.fromJSDate(to, { zone: "utc" }).setZone(rule.timezone).endOf("day");
    if (!day.isValid || !last.isValid) continue; // huso inválido → sin slots

    for (; day <= last; day = day.plus({ days: 1 })) {
      if (day.weekday !== rule.weekday) continue;
      for (let m = rule.startMinute; m + rule.slotMinutes <= rule.endMinute; m += rule.slotMinutes) {
        const startLocal = day.set({ hour: Math.floor(m / 60), minute: m % 60 });
        if (!startLocal.isValid) continue; // hora inexistente (gap de DST)
        const endLocal = startLocal.plus({ minutes: rule.slotMinutes });
        const s = startLocal.toMillis();
        const e = endLocal.toMillis();
        if (s < nowMs) continue; // no ofrecer slots pasados
        if (s < fromMs || e > toMs) continue; // fuera del rango pedido
        if (busyMs.some(([bs, be]) => s < be && bs < e)) continue; // solapa con ocupado
        if (seen.has(s)) continue; // dedupe (ventanas/reglas que coincidan)
        seen.add(s);
        out.push({ s, e });
      }
    }
  }

  out.sort((a, b) => a.s - b.s);
  return out.map(({ s, e }) => ({
    startsAt: new Date(s).toISOString(),
    endsAt: new Date(e).toISOString(),
  }));
}
