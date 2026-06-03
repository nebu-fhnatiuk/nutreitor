import { sql } from "drizzle-orm";
import { pgTable, uuid, text, index, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/**
 * Notas clínicas APPEND-ONLY: cada entrada con autor (membership) + timestamp +
 * contenido. Se acumulan como historial; nunca se editan ni borran. La
 * inmutabilidad la fuerza el GRANT en DB (sólo SELECT+INSERT al rol app), igual
 * que el audit log. Corregir = nueva entrada.
 *
 * Tenant-scoped bajo RLS `tenant_isolation` sobre `tenant_id`.
 */
export const patientNotes = pgTable(
  "patient_notes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    authorMembershipId: uuid("author_membership_id").notNull(),
    content: text("content").notNull(),
    ...timestamps,
  },
  (table) => [
    index("patient_notes_patient_idx").on(table.patientId, table.createdAt),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "patient_notes_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "patient_notes_patient_id_fk",
    }).onDelete("cascade"),
    // El autor es un membership. ON DELETE RESTRICT: no se borra un membership con
    // notas (preserva la autoría del historial). En la práctica los memberships se
    // dan de baja (revokedAt), no se borran.
    foreignKey({
      columns: [table.authorMembershipId],
      foreignColumns: [memberships.id],
      name: "patient_notes_author_membership_id_fk",
    }).onDelete("restrict"),
  ],
);

export type PatientNote = typeof patientNotes.$inferSelect;
export type NewPatientNote = typeof patientNotes.$inferInsert;
