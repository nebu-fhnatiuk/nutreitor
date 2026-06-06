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
 *
 * ROTACIÓN sin downtime (dual-secret): se firma SIEMPRE con el primary, pero al
 * verificar se aceptan varios secretos activos (primary + secondary). Para rotar se
 * agrega el nuevo como primary y el anterior queda como secondary por una ventana
 * mayor al TTL del token (cubre los tokens en vuelo), y luego se retira. Ver el
 * procedimiento en el ADR 0013 / docs/flows/agents.md.
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

/**
 * Lista de secretos ACTIVOS a partir de la config: el primero es el primary (con el
 * que se FIRMA), el resto son secondary (sólo se ACEPTAN al verificar). Si no hay
 * lista (`list` vacío/undefined), cae al `single` para no romper lo existente.
 * Fail-closed: si no queda ninguno no vacío, devuelve `[]` (firmar/verificar fallará).
 */
export function parseAgentSecrets(list: string | undefined, single: string): string[] {
  const fromList = (list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromList.length > 0 ? fromList : [single].filter(Boolean);
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

/**
 * Verifica firma + expiración. `secret` puede ser UN secreto o una LISTA de secretos
 * activos (rotación): el token es válido si su firma matchea CUALQUIERA. Devuelve el
 * contexto o `null` (fail-closed). Cada intento usa comparación en tiempo constante.
 */
export function verifyAgentContext(
  token: string,
  secret: string | readonly string[],
  now: number = Date.now(),
): AgentContext | null {
  const secrets = typeof secret === "string" ? [secret] : secret;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const a = Buffer.from(sig);
  // Probar cada secreto activo en tiempo constante (longitudes distintas → no matchea).
  let matched = false;
  for (const s of secrets) {
    const b = Buffer.from(hmac(body, s));
    if (a.length === b.length && timingSafeEqual(a, b)) {
      matched = true;
      break;
    }
  }
  if (!matched) return null;
  try {
    const ctx = JSON.parse(Buffer.from(body, "base64url").toString()) as AgentContext;
    if (typeof ctx.exp !== "number" || ctx.exp < now) return null;
    return ctx;
  } catch {
    return null;
  }
}
