import { isIP } from "node:net";

import type { Request } from "express";

/**
 * IP del cliente final. La API sólo recibe tráfico del edge (proxy de Next), así
 * que la IP del socket es la del contenedor web: el edge resuelve la IP real y la
 * manda en `x-client-ip`. Se confía en ese header porque edgeSecretMiddleware ya
 * rechazó todo request que no traiga el secreto compartido (sólo el edge lo setea).
 * Si falta o no es una IP, cae a la del socket.
 */
export function clientIp(req: Request): string {
  const raw = req.headers["x-client-ip"];
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (v && isIP(v)) return v;
  return req.socket?.remoteAddress ?? "unknown";
}
