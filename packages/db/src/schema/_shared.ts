import { sql } from "drizzle-orm";
import { timestamp, uuid, text } from "drizzle-orm/pg-core";

/**
 * Columnas comunes a TODA tabla de negocio. Definidas una sola vez para que el
 * patrón multi-tenant sea imposible de olvidar al crear una tabla nueva.
 *
 *  - `tenantId`: FK lógica a `organizations.id`. Es la columna sobre la que opera
 *    la policy de RLS. NUNCA se setea desde un parámetro del request: lo inyecta
 *    el runtime vía `SET LOCAL app.current_tenant_id` (ver tenant/with-tenant.ts).
 *  - `region`: residencia de datos. Habilita GDPR/HIPAA a futuro (mover filas de
 *    una región a otra, o promover a SILO) sin migración de modelo. Se hereda de
 *    la organización al crear la fila.
 *
 * Nota: la FK declarativa hacia organizations se agrega en cada tabla concreta
 * para evitar un ciclo de imports en este módulo base.
 */
export const tenantColumns = {
  tenantId: uuid("tenant_id").notNull(),
  region: text("region").notNull(),
};

/** Timestamps estándar. `createdAt` en UTC (timestamptz), default en la DB. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
};
