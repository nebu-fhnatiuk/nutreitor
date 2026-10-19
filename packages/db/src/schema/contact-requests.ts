import { sql } from "drizzle-orm";
import { pgEnum, pgTable, uuid, text, timestamp, index, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

export const contactRequestStatus = pgEnum("contact_request_status", ["new", "accepted", "declined"]);

/**
 * Solicitud de contacto desde la vidriera (ADR 0027). La ve SÓLO el destinatario:
 * el profesional (`membershipId`), o las admins si es para el consultorio (null).
 * Tenant-scoped bajo RLS `tenant_isolation`. Sin DELETE.
 */
export const contactRequests = pgTable(
  "contact_requests",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    membershipId: uuid("membership_id"),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    message: text("message").notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    status: contactRequestStatus("status").notNull().default("new"),
    patientId: uuid("patient_id"),
    decidedByMembershipId: uuid("decided_by_membership_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("contact_requests_inbox_idx").on(table.tenantId, table.status, table.membershipId, table.createdAt),
    foreignKey({ columns: [table.tenantId], foreignColumns: [organizations.id], name: "contact_requests_tenant_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.membershipId], foreignColumns: [memberships.id], name: "contact_requests_membership_id_fk" }).onDelete("set null"),
    foreignKey({ columns: [table.patientId], foreignColumns: [patients.id], name: "contact_requests_patient_id_fk" }).onDelete("set null"),
    foreignKey({ columns: [table.decidedByMembershipId], foreignColumns: [memberships.id], name: "contact_requests_decided_by_fk" }).onDelete("set null"),
  ],
);

export type ContactRequest = typeof contactRequests.$inferSelect;
