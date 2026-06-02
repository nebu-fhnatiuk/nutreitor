import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { tenantStorage } from "./tenant-context.store.js";

/**
 * Abre el scope de AsyncLocalStorage para CADA request (con holder vacío) y
 * ejecuta el resto del pipeline dentro de él. No autentica: de eso se encarga el
 * guard, que corre más adelante dentro de este mismo scope y completa el holder.
 *
 * Debe aplicarse a todas las rutas (ver app.module) para que guards, controllers
 * y servicios compartan el mismo contexto async.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    tenantStorage.run({}, () => next());
  }
}
