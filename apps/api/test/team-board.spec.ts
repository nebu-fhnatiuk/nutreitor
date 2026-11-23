import { hasCapability, roleCapabilities, roleHome, showStaffSharingCard, teamBoardRow, type TeamRowInput } from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/** Tablero del cuerpo técnico (KAN-109): el recorte por consentimiento es puro y vive en shared. */
const TODAY = "2026-11-22";
const base: TeamRowInput = {
  patientId: "p1",
  fullName: "Jugador Uno",
  consent: false,
  lastMeasuredOn: "2026-11-09",
  sum6: 52,
  sum6Delta: 5,
  muscleKg: 36.2,
  muscleKgDelta: 0.4,
  bodyMass: 78.2,
  bodyMassDelta: -0.4,
  lossPct: 1.2,
  adherence7: 90,
  adherencePrev7: 88,
  checkin: { date: "2026-11-20", energy: 4, mood: 5 },
  hasPlan: true,
  nextAppointmentAt: null,
};

describe("teamBoardRow", () => {
  it("sin consentimiento no lleva composición corporal ni la bandera de Σ6", () => {
    const row = teamBoardRow(base, TODAY);
    expect(row.body).toBeNull();
    expect(row.status.flags.some((f) => f.kind === "sum6Up")).toBe(false);
    expect(JSON.stringify(row)).not.toMatch(/sum6|muscleKg/);
    expect(row.bodyMass).toBe(78.2);
  });

  it("con consentimiento lleva Σ6, masa muscular y la bandera", () => {
    const row = teamBoardRow({ ...base, consent: true }, TODAY);
    expect(row.body).toEqual({ sum6: 52, sum6Delta: 5, muscleKg: 36.2, muscleKgDelta: 0.4 });
    expect(row.status.flags.some((f) => f.kind === "sum6Up")).toBe(true);
  });
});

describe("rol coach", () => {
  it("sólo lee su organización y el tablero del equipo", () => {
    expect(roleCapabilities.coach).toEqual(["org:read", "team:read"]);
    expect(hasCapability("coach", "patient:read")).toBe(false);
    expect(hasCapability("admin", "team:read")).toBe(true);
    expect(roleHome.coach).toBe("/equipo");
  });
});

describe("tarjeta de consentimiento del portal", () => {
  it("se muestra si hay cuerpo técnico o si el consentimiento está activo (siempre se puede revocar)", () => {
    expect(showStaffSharingCard({ shareBody: false, at: null, by: null, hasCoaches: true })).toBe(true);
    expect(showStaffSharingCard({ shareBody: true, at: null, by: "admin", hasCoaches: false })).toBe(true);
    expect(showStaffSharingCard({ shareBody: false, at: null, by: null, hasCoaches: false })).toBe(false);
  });
});
