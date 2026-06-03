import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { locations } from "./locations.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/** Estado de una asignación. Versionada: cerrar = endedAt + status 'ended'. */
export const careAssignmentStatus = pgEnum("care_assignment_status", [
  "active",
  "ended",
]);

/**
 * Asignación paciente↔profesional: M:N, VERSIONADA, todas iguales (sin rol).
 * El paciente NO lleva professional_id; la relación vive acá. Referencia el
 * MEMBERSHIP del profesional (no el user global), coherente con multi-org.
 *
 *  - Cambiar de profesional = cerrar la vigente (endedAt + status 'ended') y abrir
 *    una nueva. NUNCA se borra: se conserva la historia de quién atendió y cuándo.
 *  - Unique parcial (patient, membership) WHERE status='active': nunca dos activas
 *    para el mismo par (consistencia de "vigente").
 *
 * Tenant-scoped bajo RLS `tenant_isolation` sobre `tenant_id`.
 */
export const careAssignments = pgTable(
  "care_assignments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    locationId: uuid("location_id"),
    status: careAssignmentStatus("status").notNull().default("active"),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Quién hizo la asignación (admin), para trazabilidad además del audit. */
    assignedByMembershipId: uuid("assigned_by_membership_id"),
    ...timestamps,
  },
  (table) => [
    index("care_assignments_patient_idx").on(table.patientId, table.status),
    index("care_assignments_membership_idx").on(
      table.membershipId,
      table.status,
    ),
    // Nunca dos asignaciones ACTIVAS para el mismo (paciente, profesional).
    uniqueIndex("care_assignments_active_unique")
      .on(table.patientId, table.membershipId)
      .where(sql`status = 'active'`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "care_assignments_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "care_assignments_patient_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.membershipId],
      foreignColumns: [memberships.id],
      name: "care_assignments_membership_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.locationId],
      foreignColumns: [locations.id],
      name: "care_assignments_location_id_fk",
    }).onDelete("set null"),
  ],
);

export type CareAssignment = typeof careAssignments.$inferSelect;
export type NewCareAssignment = typeof careAssignments.$inferInsert;
