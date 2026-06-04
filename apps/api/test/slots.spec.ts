import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { generateSlots, type AvailabilityRuleInput } from "../src/modules/scheduling/slots.js";

/**
 * Generación de slots: huso del profesional → UTC, DST por Luxon, exclusión de
 * ocupados/pasados. Es el corazón correcto del agendamiento, así que el contrato
 * se fija acá.
 */

const AR = "America/Argentina/Buenos_Aires"; // UTC-3 fijo (sin DST)
const from = new Date("2026-06-01T00:00:00Z");
const to = new Date("2026-06-02T00:00:00Z");
// weekday ISO del día objetivo en AR (robusto: no hardcodeo el día de la semana).
const targetWeekday = DateTime.fromJSDate(from, { zone: "utc" }).setZone(AR).plus({ days: 1 }).weekday;

// Regla 09:00–11:00, slots de 30' → 09:00, 09:30, 10:00, 10:30.
const rule: AvailabilityRuleInput = {
  timezone: AR,
  weekday: targetWeekday,
  startMinute: 9 * 60,
  endMinute: 11 * 60,
  slotMinutes: 30,
};

describe("generateSlots", () => {
  it("genera slots en el huso del pro y los convierte a UTC (AR=UTC-3)", () => {
    const slots = generateSlots({ rules: [rule], busy: [], from, to, now: from });
    expect(slots.length).toBe(4);
    // 09:00 AR = 12:00Z
    expect(slots[0]!.startsAt).toBe("2026-06-01T12:00:00.000Z");
    expect(slots[0]!.endsAt).toBe("2026-06-01T12:30:00.000Z");
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-06-01T12:00:00.000Z",
      "2026-06-01T12:30:00.000Z",
      "2026-06-01T13:00:00.000Z",
      "2026-06-01T13:30:00.000Z",
    ]);
  });

  it("excluye slots que solapan con un horario ocupado", () => {
    const busy = [
      { startsAt: new Date("2026-06-01T12:30:00Z"), endsAt: new Date("2026-06-01T13:00:00Z") },
    ];
    const slots = generateSlots({ rules: [rule], busy, from, to, now: from });
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-06-01T12:00:00.000Z",
      "2026-06-01T13:00:00.000Z",
      "2026-06-01T13:30:00.000Z",
    ]);
  });

  it("no ofrece slots pasados (< now)", () => {
    const slots = generateSlots({
      rules: [rule],
      busy: [],
      from,
      to,
      now: new Date("2026-06-01T13:30:00Z"), // 10:30 AR
    });
    expect(slots.map((s) => s.startsAt)).toEqual(["2026-06-01T13:30:00.000Z"]);
  });

  it("respeta DST: el mismo 09:00 local cae en distinto UTC según la fecha (NY)", () => {
    const NY = "America/New_York";
    const slotAt = (nyDate: string) => {
      // Rango anclado a la medianoche de NY de ese día (evita que 00:00Z caiga en
      // el día anterior y desalinee el weekday).
      const dayStart = DateTime.fromISO(`${nyDate}T00:00:00`, { zone: NY });
      const r: AvailabilityRuleInput = {
        timezone: NY,
        weekday: dayStart.weekday,
        startMinute: 9 * 60,
        endMinute: 9 * 60 + 30,
        slotMinutes: 30,
      };
      const slots = generateSlots({
        rules: [r],
        busy: [],
        from: dayStart.toJSDate(),
        to: dayStart.plus({ days: 1 }).toJSDate(),
        now: dayStart.toJSDate(),
      });
      return slots[0]?.startsAt;
    };
    // Verano (EDT, UTC-4): 09:00 → 13:00Z. Invierno (EST, UTC-5): 09:00 → 14:00Z.
    expect(slotAt("2026-07-06")).toBe("2026-07-06T13:00:00.000Z");
    expect(slotAt("2026-01-05")).toBe("2026-01-05T14:00:00.000Z");
  });
});
