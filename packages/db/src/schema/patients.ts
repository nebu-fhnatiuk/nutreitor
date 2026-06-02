import { sql } from "drizzle-orm";
import { pgTable, uuid, text, index, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { organizations } from "./organizations.js";

/**
 * Pacientes. Tabla de negocio de ejemplo que materializa el patrón multi-tenant:
 * `tenant_id` + `region` (de tenantColumns) y FK a organizations.
 *
 * El aislamiento NO depende de filtrar por `tenant_id` en la app: lo garantiza
 * la policy RLS `tenant_isolation` (ver migrations/0001_roles_and_rls.sql). El
 * índice sobre `tenant_id` es el índice de acceso primario en modelo POOL.
 */
export const patients = pgTable(
  "patients",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    fullName: text("full_name").notNull(),
    ...timestamps,
  },
  (table) => [
    index("patients_tenant_id_idx").on(table.tenantId),
    index("patients_tenant_created_idx").on(table.tenantId, table.createdAt),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "patients_tenant_id_fk",
    }).onDelete("cascade"),
  ],
);

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
