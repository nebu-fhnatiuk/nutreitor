import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, index, foreignKey, primaryKey } from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/**
 * Chat profesional ↔ paciente (Fase 4.3): una conversación por paciente, con su
 * equipo. APPEND-ONLY (el GRANT sólo da SELECT + INSERT): comunicación clínica que
 * no se edita ni se borra. El autor es un membership (paciente o miembro del equipo).
 */
export const patientMessages = pgTable(
  "patient_messages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    authorMembershipId: uuid("author_membership_id").notNull(),
    body: text("body").notNull(),
    ...timestamps,
  },
  (table) => [
    index("patient_messages_patient_idx").on(table.patientId, table.createdAt),
    index("patient_messages_tenant_idx").on(table.tenantId),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "patient_messages_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "patient_messages_patient_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.authorMembershipId],
      foreignColumns: [memberships.id],
      name: "patient_messages_author_membership_id_fk",
    }).onDelete("restrict"),
  ],
);

/** Hasta dónde leyó cada participante la conversación de un paciente. */
export const messageReads = pgTable(
  "message_reads",
  {
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.patientId, table.membershipId] }),
    index("message_reads_tenant_idx").on(table.tenantId),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "message_reads_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "message_reads_patient_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.membershipId],
      foreignColumns: [memberships.id],
      name: "message_reads_membership_id_fk",
    }).onDelete("cascade"),
  ],
);
