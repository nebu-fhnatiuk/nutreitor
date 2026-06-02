import { sql } from "drizzle-orm";

import type { Database } from "../client.js";

/** Nombre del GUC donde vive el tenant del contexto. Debe coincidir con la policy RLS. */
export const TENANT_GUC = "app.current_tenant_id";

/** Transacción Drizzle con el tenant ya inyectado. Mismo tipo que el callback de `db.transaction`. */
export type TenantTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Ejecuta `cb` dentro de una transacción con el tenant inyectado en la sesión.
 *
 * Por qué transacción + SET LOCAL:
 *  - `set_config(name, value, is_local=true)` equivale a `SET LOCAL`: el valor
 *    vive sólo hasta el COMMIT/ROLLBACK. Al cerrarse la transacción, la conexión
 *    vuelve al pool sin contexto residual → no hay fuga de tenant entre requests.
 *  - Al ser transaction-scoped, es compatible con pgBouncer en transaction-pooling
 *    (clave para Fargate). `SET` de sesión NO lo sería.
 *  - Usamos la forma `set_config(..., $1, ...)` (no `SET LOCAL ...`) para pasar el
 *    tenantId como parámetro y evitar cualquier interpolación de string.
 *
 * Toda lectura/escritura tenant-scoped DEBE pasar por acá. La policy RLS
 * `tenant_isolation` hace el resto: sin este SET, `current_setting(...,true)`
 * devuelve NULL y la policy deniega todo (fail-closed).
 */
export async function withTenant<T>(
  db: Database,
  tenantId: string,
  // PromiseLike para aceptar tal cual los query builders de Drizzle (thenables).
  cb: (tx: TenantTx) => PromiseLike<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config(${TENANT_GUC}, ${tenantId}, true)`,
    );
    return cb(tx);
  });
}
