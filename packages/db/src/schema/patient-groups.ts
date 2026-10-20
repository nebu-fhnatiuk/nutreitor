import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, index, primaryKey, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/**
 * Grupo de deportistas (ADR 0031): plantel, división o turno del gimnasio. Lo
 * arma el admin; un paciente puede estar en varios. Tenant-scoped bajo RLS
 * `tenant_isolation`. Nombre único por tenant (índice sobre lower(btrim(name))).
 */
export const patientGroups = pgTable(
  "patient_groups",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (table) => [
    foreignKey({ columns: [table.tenantId], foreignColumns: [organizations.id], name: "patient_groups_tenant_id_fk" }).onDelete("cascade"),
  ],
);

/** Pertenencia paciente ↔ grupo. Borrar el grupo o el paciente la borra. */
export const patientGroupMembers = pgTable(
  "patient_group_members",
  {
    ...tenantColumns,
    groupId: uuid("group_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.patientId] }),
    index("patient_group_members_patient_idx").on(table.patientId),
    foreignKey({ columns: [table.tenantId], foreignColumns: [organizations.id], name: "patient_group_members_tenant_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.groupId], foreignColumns: [patientGroups.id], name: "patient_group_members_group_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.patientId], foreignColumns: [patients.id], name: "patient_group_members_patient_id_fk" }).onDelete("cascade"),
  ],
);

export type PatientGroup = typeof patientGroups.$inferSelect;
