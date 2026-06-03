import type { NextFunction, Request, Response } from "express";

import type { ApiEnv } from "../config/app-config.module.js";

/**
 * Guard de borde: exige el secreto compartido edge↔API (`x-internal-secret`) en
 * todo request salvo el healthcheck. Es defensa en profundidad: si la API quedara
 * alcanzable fuera del edge (proxy de Next), los requests sin el secreto se
 * rechazan. En prod el borde primario es de red (subnet privada / ALB); esto es
 * la segunda capa.
 *
 * Comparación de longitud constante para no filtrar el secreto por timing.
 */
export function edgeSecretMiddleware(env: ApiEnv) {
  const expected = env.EDGE_SHARED_SECRET;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path === "/health") return next();

    const provided = req.headers["x-internal-secret"];
    const value = Array.isArray(provided) ? provided[0] : provided;
    if (!value || !constantTimeEqual(value, expected)) {
      res.status(401).json({ statusCode: 401, error: "Unauthorized" });
      return;
    }
    next();
  };
}

/** Igualdad en tiempo constante (evita oracle de timing sobre el secreto). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
