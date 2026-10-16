import { createHash } from "node:crypto";

/**
 * Rate-limiting por VENTANA FIJA (ADR 0017). Lógica pura sobre un `CounterStore`
 * (Redis en runtime, memoria en tests): cada regla cuenta hits por sujeto (IP o
 * email) dentro de una ventana de `windowSec`, y corta al superar `limit`.
 *
 * Ventana fija y no deslizante a propósito: es un INCR + EXPIRE por request, sin
 * sorted sets. El costo es que en el borde entre dos ventanas se pueden colar hasta
 * 2×limit; para frenar fuerza bruta y spam de reservas alcanza.
 */

/** Metadata de @RateLimit (acá y no en el decorator, para no ciclar con el guard). */
export const RATE_LIMIT_KEY = "rateLimit";

export interface RateLimitRule {
  /** Nombre estable de la regla (forma parte de la clave en Redis). */
  name: string;
  limit: number;
  windowSec: number;
  /** Sujeto que se cuenta: IP del cliente o email del body (por tenant). */
  by: "ip" | "email";
}

export interface CounterStore {
  /** Incrementa `key` y devuelve el nuevo valor; la clave expira en `windowSec`. */
  hit(key: string, windowSec: number): Promise<number>;
}

export interface RateLimitVerdict {
  ok: boolean;
  /** Segundos hasta que se abre la próxima ventana (para `Retry-After`). */
  retryAfterSec: number;
}

/**
 * El sujeto se hashea antes de ir a la clave: emails e IPs son datos personales
 * y no tienen por qué quedar legibles en Redis.
 */
export function subjectKey(subject: string): string {
  return createHash("sha256").update(subject).digest("base64url").slice(0, 22);
}

export async function checkRateLimit(
  store: CounterStore,
  rule: RateLimitRule,
  subject: string,
  nowMs: number = Date.now(),
): Promise<RateLimitVerdict> {
  const windowMs = rule.windowSec * 1000;
  const window = Math.floor(nowMs / windowMs);
  const key = `rl:${rule.name}:${subjectKey(subject)}:${window}`;
  const count = await store.hit(key, rule.windowSec);
  const retryAfterSec = Math.max(1, Math.ceil(((window + 1) * windowMs - nowMs) / 1000));
  return { ok: count <= rule.limit, retryAfterSec };
}
