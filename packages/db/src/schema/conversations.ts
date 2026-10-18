import { sql } from "drizzle-orm";
import { pgEnum, pgTable, uuid, text, timestamp, index, foreignKey, primaryKey } from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

export const conversationKind = pgEnum("conversation_kind", ["patient_professional", "professional_admin"]);

/**
 * Conversaciones PRIVADAS por par (ADR 0024):
 *  - patient_professional: una por (paciente, profesional); sólo ellos dos.
 *  - professional_admin: una por profesional con la administración (cualquier admin).
 * Unicidad por índices parciales (ver 0035); `patient_id` sólo en el primer tipo.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    kind: conversationKind("kind").notNull(),
    patientId: uuid("patient_id"),
    professionalMembershipId: uuid("professional_membership_id").notNull(),
    ...timestamps,
  },
  (table) => [
    index("conversations_tenant_idx").on(table.tenantId),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "conversations_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "conversations_patient_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.professionalMembershipId],
      foreignColumns: [memberships.id],
      name: "conversations_professional_membership_id_fk",
    }).onDelete("restrict"),
  ],
);

/** Mensajes: APPEND-ONLY (el GRANT sólo da SELECT + INSERT al rol app). */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    conversationId: uuid("conversation_id").notNull(),
    authorMembershipId: uuid("author_membership_id").notNull(),
    body: text("body").notNull(),
    ...timestamps,
  },
  (table) => [
    index("messages_conversation_idx").on(table.conversationId, table.createdAt),
    index("messages_tenant_idx").on(table.tenantId),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "messages_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversations.id],
      name: "messages_conversation_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.authorMembershipId],
      foreignColumns: [memberships.id],
      name: "messages_author_membership_id_fk",
    }).onDelete("restrict"),
  ],
);

/** Hasta dónde leyó cada participante una conversación (contadores de no leídos). */
export const conversationReads = pgTable(
  "conversation_reads",
  {
    conversationId: uuid("conversation_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    ...tenantColumns,
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.membershipId] }),
    index("conversation_reads_tenant_idx").on(table.tenantId),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversations.id],
      name: "conversation_reads_conversation_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.membershipId],
      foreignColumns: [memberships.id],
      name: "conversation_reads_membership_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "conversation_reads_tenant_id_fk",
    }).onDelete("cascade"),
  ],
);
