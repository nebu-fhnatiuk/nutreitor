import { createHash, randomBytes } from "node:crypto";

/** Token opaco de alta entropía (refresh, invitación). Sólo el raw viaja; en DB va el hash. */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** Hash determinista para guardar/comparar tokens (nunca se guarda el raw). */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
