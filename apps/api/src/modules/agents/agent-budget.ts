import { sql } from "drizzle-orm";
import { agentRuns, type TenantTx } from "@nutreitor/db";

/**
 * Control de costo/abuso de los agentes, por TENANT. Se evalúa en el gateway ANTES
 * de salir hacia el servicio de inferencia: si el tenant se pasó del rate o del tope
 * mensual, cortamos acá y no egresa nada (ni PHI ni costo). El uso se deriva del
 * audit `agent_runs` (mismas filas que escribe el servicio Python), leído bajo RLS.
 *
 * El tope es post-hoc por naturaleza: los tokens de una llamada recién se conocen
 * después, así que se mide el consumo ACUMULADO antes de habilitar la siguiente.
 */

export interface AgentBudgetLimits {
  /** Máximo de llamadas por minuto por tenant. 0 = sin límite. */
  ratePerMin: number;
  /** Tope de tokens (input+output) en el mes corriente por tenant. 0 = sin límite. */
  monthlyTokenCap: number;
}

export interface AgentUsage {
  lastMinuteCount: number;
  monthTokens: number;
}

export interface BudgetVerdict {
  ok: boolean;
  /** "rate" | "cap" cuando ok=false, para mensaje/observabilidad. */
  reason?: "rate" | "cap";
}

/** Lee el uso del tenant del contexto (RLS) desde el audit de runs. */
export async function loadAgentUsage(tx: TenantTx): Promise<AgentUsage> {
  const rows = await tx
    .select({
      lastMinuteCount: sql<string>`count(*) filter (where ${agentRuns.createdAt} >= now() - interval '1 minute')`,
      monthTokens: sql<string>`coalesce(sum(coalesce(${agentRuns.inputTokens}, 0) + coalesce(${agentRuns.outputTokens}, 0)) filter (where ${agentRuns.createdAt} >= date_trunc('month', now())), 0)`,
    })
    .from(agentRuns);
  const row = rows[0];
  return {
    // count()/sum() vuelven como string (bigint/numeric) en pg.
    lastMinuteCount: Number(row?.lastMinuteCount ?? 0),
    monthTokens: Number(row?.monthTokens ?? 0),
  };
}

/** Decisión pura: ¿el uso actual deja pasar una llamada más? */
export function checkAgentBudget(
  usage: AgentUsage,
  limits: AgentBudgetLimits,
): BudgetVerdict {
  if (limits.ratePerMin > 0 && usage.lastMinuteCount >= limits.ratePerMin) {
    return { ok: false, reason: "rate" };
  }
  if (limits.monthlyTokenCap > 0 && usage.monthTokens >= limits.monthlyTokenCap) {
    return { ok: false, reason: "cap" };
  }
  return { ok: true };
}
