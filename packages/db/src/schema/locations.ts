import { sql } from "drizzle-orm";
import { pgTable, uuid, text, index, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { organizations } from "./organizations.js";

/**
 * Sede/ubicación de una organización. ESQUELÉTICA a propósito (id, tenant, name):
 * en este sprint es sólo la REFERENCIA que pacientes y asignaciones pueden apuntar,
 * para no retro-encajar el concepto multi-sede después (migración dolorosa). La
 * gestión de sedes (CRUD/UI/permisos) llega cuando un cliente multi-sede la pida.
 *
 * Tenant-scoped bajo RLS `tenant_isolation` sobre `tenant_id`.
 */
export const locations = pgTable(
  "locations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    index("locations_tenant_id_idx").on(table.tenantId),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "locations_tenant_id_fk",
    }).onDelete("cascade"),
  ],
);

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
