import { longestStreak, storyContent, type ReportDataDto } from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/** "Tu mes en números" (KAN-76): qué números van a la historia y cuáles nunca. */
const data = (over: Partial<ReportDataDto["adherence"]> = {}, extra: Partial<ReportDataDto> = {}): ReportDataDto => ({
  from: "2026-10-01",
  to: "2026-10-31",
  measurements: {
    count: 2,
    weightKg: { start: 74.2, end: 73.1, delta: -1.1 },
    bodyFatPct: { start: 14, end: 13.2, delta: -0.8 },
    waistCm: { start: 80, end: 79, delta: -1 },
  },
  adherence: { pct: 86, logs: 60, daysLogged: 21, longestStreak: 9, byMeal: [], ...over },
  checkins: { count: 10, hunger: 3, energy: 4.2, mood: 4 },
  appointments: { completed: 2, cancelled: 1, booked: 0 },
  plan: { title: "Pretemporada", version: 3, versionsInMonth: 1 },
  ...extra,
});
const who = { fullName: "Juan Pérez", club: "Club Atlético" };

describe("longestStreak", () => {
  it("cuenta días seguidos, sin importar orden ni repetidos, y cruza meses", () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(["2026-10-05"])).toBe(1);
    expect(longestStreak(["2026-10-03", "2026-10-01", "2026-10-02", "2026-10-02", "2026-10-07", "2026-10-08"])).toBe(3);
    expect(longestStreak(["2026-09-30", "2026-10-01"])).toBe(2);
  });
});

describe("storyContent", () => {
  it("adherencia de número grande; después días, racha y consultas", () => {
    const s = storyContent({ month: "2026-10", status: "published", data: data() }, who)!;
    expect(s.month).toBe("OCTUBRE 2026");
    expect(s.firstName).toBe("Juan");
    expect(s.hero).toEqual({ value: "86", unit: "%", label: "del plan cumplido" });
    expect(s.stats.map((x) => x.value)).toEqual(["21", "9", "2"]);
    expect(s.fileName).toBe("mi-mes-2026-10.png");
  });

  it("nunca lleva medidas corporales ni datos del plan", () => {
    const s = storyContent({ month: "2026-10", status: "published", data: data() }, who)!;
    const text = JSON.stringify(s);
    for (const v of ["73", "74", "13,2", "79", "Pretemporada", "peso", "grasa", "cintura"]) expect(text).not.toContain(v);
  });

  it("sin publicar o sin nada para contar no hay historia", () => {
    expect(storyContent({ month: "2026-10", status: "draft", data: data() }, who)).toBeNull();
    const empty = data(
      { pct: null, logs: 0, daysLogged: 0, longestStreak: 0 },
      { checkins: { count: 0, hunger: null, energy: null, mood: null }, appointments: { completed: 0, cancelled: 2, booked: 1 } },
    );
    expect(storyContent({ month: "2026-10", status: "published", data: empty }, who)).toBeNull();
  });

  it("reporte viejo sin racha y sin registros: arranca por las consultas", () => {
    const old = data({ pct: null, logs: 0, daysLogged: 0, longestStreak: undefined });
    const s = storyContent({ month: "2026-09", status: "published", data: old }, who)!;
    expect(s.hero.label).toBe("consultas");
    expect(s.stats).toEqual([{ value: "4,2", unit: "/5", label: "de energía promedio" }]);
  });
});
