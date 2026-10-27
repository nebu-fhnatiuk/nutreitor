import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { Database } from "@nutreitor/db";

import { CONTROL_DB } from "./database.constants.js";

/**
 * Acceso de plano de control (rol nutreitor_control, ADR 0048): alta de
 * organizaciones, consola de plataforma, login, invitaciones, sesiones y recuperar
 * la contraseña. Ve entre tenants sólo las tablas que necesita (GRANT + policy
 * `control_plane`); no tiene DDL ni acceso a datos clínicos.
 *
 * El tipo lo dice todo: quien inyecta AdminDbService está saliendo del perímetro del
 * tenant a propósito. A futuro este plano puede vivir en un servicio aparte (KAN-16).
 */
@Injectable()
export class AdminDbService {
  constructor(@Inject(CONTROL_DB) private readonly controlDb: Database | null) {}

  /** DB del plano de control. Tira si la API no fue configurada con el rol control. */
  get db(): Database {
    if (!this.controlDb) {
      throw new ServiceUnavailableException(
        "Operación de administración no disponible: falta DATABASE_CONTROL_URL.",
      );
    }
    return this.controlDb;
  }
}
