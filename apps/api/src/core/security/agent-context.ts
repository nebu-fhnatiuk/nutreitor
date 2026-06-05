import { createHmac, timingSafeEqual } from "node:crypto";

import type { MembershipRole } from "@nutreitor/shared";

/**
 * Token de contexto de tenant FIRMADO (HMAC-SHA256 + TTL), para propagar la sesión
 * del gateway Nest al servicio de agentes (Python) sin que éste confíe en nada del
 * request crudo. Es el contrato de propagación de contexto entre servicios (ADR
 * 0012/0013): el gateway firma; el servicio verifica con el secreto compartido y
 * recién ahí setea `app.current_tenant_id` (RLS).
 *
 * Formato: `<base64url(payload JSON)>.<base64url(hmac)>`. El payload lleva `exp`
 * (epoch ms) para acotar la ventana de validez.
 */
export interface AgentContext {
  tenantId: string;
  region: string;
  userId: string;
  role: MembershipRole;
  exp: number; // epoch ms
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}
function hmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Firma el contexto con TTL. `now` inyectable para tests. */
export function signAgentContext(
  ctx: Omit<AgentContext, "exp">,
  secret: string,
  ttlMs: number,
  now: number = Date.now(),
): string {
  const payload: AgentContext = { ...ctx, exp: now + ttlMs };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${hmac(body, secret)}`;
}

/** Verifica firma + expiración. Devuelve el contexto o `null` (fail-closed). */
export function verifyAgentContext(
  token: string,
  secret: string,
  now: number = Date.now(),
): AgentContext | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(body, secret);
  // Comparación en tiempo constante; longitudes distintas → no es válido.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const ctx = JSON.parse(Buffer.from(body, "base64url").toString()) as AgentContext;
    if (typeof ctx.exp !== "number" || ctx.exp < now) return null;
    return ctx;
  } catch {
    return null;
  }
}
