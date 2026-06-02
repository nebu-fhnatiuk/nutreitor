import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { Database } from "@nutreitor/db";

import { OWNER_DB } from "./database.constants.js";

/**
 * Acceso de control-plane (rol owner, BYPASSA RLS). Reservado a operaciones de
 * plataforma que no son de ningún tenant: alta/listado de organizaciones.
 *
 * El tipo lo dice todo: quien inyecta AdminDbService está saliendo del perímetro
 * de RLS a propósito. En el futuro este control-plane puede vivir en un servicio
 * separado sin owner-creds en el plano de datos.
 */
@Injectable()
export class AdminDbService {
  constructor(@Inject(OWNER_DB) private readonly ownerDb: Database | null) {}

  /** DB con privilegios de owner. Tira si la API no fue configurada como control-plane. */
  get db(): Database {
    if (!this.ownerDb) {
      throw new ServiceUnavailableException(
        "Operación de administración no disponible: falta DATABASE_OWNER_URL.",
      );
    }
    return this.ownerDb;
  }
}
