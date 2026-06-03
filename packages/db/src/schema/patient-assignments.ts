import { sql } from "drizzle-orm";
import { pgTable, uuid, unique, index, foreignKey } from "drizzle-orm/pg-core";

import { regionEnum } from "./_region.js";
import { timestamps } from "./_shared.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";
import { users } from "./users.js";

/**
 * Relación profesional↔paciente dentro del tenant (N–N): qué profesional sigue a
 * qué paciente. `professionalUserId` es la identidad global; su rol de profesional
 * lo da el membership en esta org. Tenant-scoped por `organizationId` (RLS).
 */
export const patientAssignments = pgTable(
  "patient_assignments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id").notNull(),
    region: regionEnum("region").notNull(),
    patientId: uuid("patient_id").notNull(),
    professionalUserId: uuid("professional_user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("patient_assignments_unique").on(
      table.patientId,
      table.professionalUserId,
    ),
    index("patient_assignments_org_idx").on(table.organizationId),
    index("patient_assignments_professional_idx").on(table.professionalUserId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: "patient_assignments_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "patient_assignments_patient_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.professionalUserId],
      foreignColumns: [users.id],
      name: "patient_assignments_professional_user_id_fk",
    }).onDelete("cascade"),
  ],
);

export type PatientAssignment = typeof patientAssignments.$inferSelect;
export type NewPatientAssignment = typeof patientAssignments.$inferInsert;
