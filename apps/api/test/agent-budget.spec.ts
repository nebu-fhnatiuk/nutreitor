import { describe, expect, it } from "vitest";

import { checkAgentBudget } from "../src/modules/agents/agent-budget.js";

/**
 * Decisión pura del tope de costo/abuso por tenant. La lectura del uso (agent_runs
 * bajo RLS) se prueba en el smoke; acá fijamos la lógica del corte.
 */
const LIMITS = { ratePerMin: 30, monthlyTokenCap: 1_000_000 };

describe("checkAgentBudget", () => {
  it("deja pasar dentro de ambos límites", () => {
    expect(checkAgentBudget({ lastMinuteCount: 5, monthTokens: 500_000 }, LIMITS)).toEqual({
      ok: true,
    });
  });

  it("corta por rate cuando se alcanza el máximo por minuto", () => {
    expect(checkAgentBudget({ lastMinuteCount: 30, monthTokens: 0 }, LIMITS)).toEqual({
      ok: false,
      reason: "rate",
    });
  });

  it("corta por tope mensual de tokens", () => {
    expect(
      checkAgentBudget({ lastMinuteCount: 1, monthTokens: 1_000_000 }, LIMITS),
    ).toEqual({ ok: false, reason: "cap" });
  });

  it("0 = sin límite (ninguno de los dos corta)", () => {
    expect(
      checkAgentBudget(
        { lastMinuteCount: 9_999, monthTokens: 9_999_999 },
        { ratePerMin: 0, monthlyTokenCap: 0 },
      ),
    ).toEqual({ ok: true });
  });

  it("rate tiene prioridad sobre cap cuando ambos se exceden", () => {
    expect(
      checkAgentBudget({ lastMinuteCount: 30, monthTokens: 2_000_000 }, LIMITS),
    ).toEqual({ ok: false, reason: "rate" });
  });
});
