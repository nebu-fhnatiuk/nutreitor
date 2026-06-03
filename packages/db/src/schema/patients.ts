import { sql } from "drizzle-orm";
import { pgTable, uuid, text, index, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

/**
 * Pacientes como ENTIDAD CLÍNICA, separada de la cuenta de acceso. Lo crea un
 * profesional/admin y existe aunque el paciente nunca se loguee.
 *
 *  - `userId`: vínculo (nullable) a la identidad global. Se setea cuando el
 *    paciente acepta una invitación y habilita su cuenta. Sin cuenta = NULL.
 *  - `email`: dato de contacto (opcional). No es la credencial.
 *
 * Aislamiento por RLS `tenant_isolation` sobre `tenant_id` (modelo POOL).
 */
export const patients = pgTable(
  "patients",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    fullName: text("full_name").notNull(),
    email: text("email"),
    userId: uuid("user_id"),
    ...timestamps,
  },
  (table) => [
    index("patients_tenant_id_idx").on(table.tenantId),
    index("patients_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("patients_user_id_idx").on(table.userId),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "patients_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "patients_user_id_fk",
    }).onDelete("set null"),
  ],
);

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
