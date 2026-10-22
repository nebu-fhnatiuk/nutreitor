import { boardStatus, compareBoard, daysBetween, type BoardInput } from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/** Semáforo de la pizarra del plantel (KAN-70): umbrales y orden. */
const TODAY = "2026-10-20";
const OK: BoardInput = {
  lastMeasuredOn: "2026-10-10",
  sum6Delta: -1.5,
  lossPct: 1.2,
  adherence7: 85,
  adherencePrev7: 80,
};

describe("pizarra del plantel", () => {
  it("todo en rango: sin avisos", () => {
    expect(boardStatus(OK, TODAY)).toEqual({ zone: "ok", flags: [], daysSinceMeasured: 10 });
  });

  it("días sin medir: hasta 30 está bien; más, en el límite; nunca, también", () => {
    expect(boardStatus({ ...OK, lastMeasuredOn: "2026-09-20" }, TODAY).zone).toBe("ok");
    const stale = boardStatus({ ...OK, lastMeasuredOn: "2026-09-09" }, TODAY);
    expect(stale).toMatchObject({ zone: "warn", daysSinceMeasured: 41, flags: [{ kind: "stale", text: "Sin medir hace 41 días" }] });
    expect(boardStatus({ ...OK, lastMeasuredOn: null }, TODAY).flags[0]).toMatchObject({ kind: "unmeasured", zone: "warn" });
  });

  it("pérdida de peso: más de 2 % en el límite, más de 3 % fuera", () => {
    expect(boardStatus({ ...OK, lossPct: 2 }, TODAY).zone).toBe("ok");
    expect(boardStatus({ ...OK, lossPct: 2.3 }, TODAY).flags[0]).toMatchObject({
      kind: "dehydration",
      zone: "warn",
      text: "Perdió 2,3 % entrenando",
    });
    expect(boardStatus({ ...OK, lossPct: 3.4 }, TODAY).zone).toBe("bad");
  });

  it("Σ6: una suba menor a 2 mm es error de medición; desde 2 mm avisa", () => {
    expect(boardStatus({ ...OK, sum6Delta: 1.9 }, TODAY).zone).toBe("ok");
    expect(boardStatus({ ...OK, sum6Delta: 4.8 }, TODAY).flags[0]).toMatchObject({ kind: "sum6Up", text: "Σ6 subió 4,8 mm" });
  });

  it("adherencia: baja de 15 puntos en el límite; menos de 50 % fuera; sin registros no avisa", () => {
    expect(boardStatus({ ...OK, adherence7: 66, adherencePrev7: 80 }, TODAY).zone).toBe("ok");
    expect(boardStatus({ ...OK, adherence7: 65, adherencePrev7: 80 }, TODAY).flags[0]).toMatchObject({
      kind: "adherenceDown",
      zone: "warn",
    });
    expect(boardStatus({ ...OK, adherence7: 40, adherencePrev7: 90 }, TODAY).flags).toEqual([
      { kind: "adherenceLow", zone: "bad", text: "Adherencia 40 %" },
    ]);
    expect(boardStatus({ ...OK, adherence7: null, adherencePrev7: null }, TODAY).zone).toBe("ok");
  });

  it("varios avisos: el más grave primero", () => {
    const s = boardStatus({ lastMeasuredOn: null, sum6Delta: null, lossPct: 3.5, adherence7: 70, adherencePrev7: 90 }, TODAY);
    expect(s.zone).toBe("bad");
    expect(s.flags.map((f) => f.kind)).toEqual(["dehydration", "adherenceDown", "unmeasured"]);
  });

  it("orden: fuera → límite → en rango; dentro de la zona, más avisos primero y después nombre", () => {
    const row = (fullName: string, i: Partial<BoardInput>) => ({ fullName, status: boardStatus({ ...OK, ...i }, TODAY) });
    const rows = [
      row("Ana", {}),
      row("Beto", { lossPct: 2.5 }),
      row("Ciro", { lossPct: 2.5, sum6Delta: 3 }),
      row("Dani", { adherence7: 30 }),
      row("Abel", {}),
    ];
    expect(rows.sort(compareBoard).map((r) => r.fullName)).toEqual(["Dani", "Ciro", "Beto", "Abel", "Ana"]);
  });

  it("días entre fechas sin corrimiento por zona horaria", () => {
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("2026-10-20", "2026-10-20")).toBe(0);
  });
});
