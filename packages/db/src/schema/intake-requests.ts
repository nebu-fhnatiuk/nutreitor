import { sql } from "drizzle-orm";
import { foreignKey, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { tenantColumns } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/**
 * Formulario pedido al deportista (KAN-60, ADR 0045): anamnesis o frecuencia de
 * consumo. Lo completa en el portal y el profesional elige qué pasa a la ficha.
 * Sin DELETE (se cancela). Un pedido abierto por deportista y tipo (0051).
 */
export const intakeRequests = pgTable(
  "intake_requests",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    kind: text("kind").$type<"anamnesis" | "food_frequency">().notNull(),
    status: text("status").$type<"requested" | "submitted" | "reviewed" | "cancelled">().notNull().default("requested"),
    requestedByMembershipId: uuid("requested_by_membership_id").notNull(),
    message: text("message"),
    /** Quién lo originó: el profesional a mano, o automático al asignar o reservar (0052). */
    trigger: text("trigger").$type<"manual" | "assignment" | "booking">().notNull().default("manual"),
    /** Cómo le llega: aviso del portal, o dentro de la invitación si no tenía cuenta (0052). */
    delivery: text("delivery").$type<"portal" | "invitation">().notNull().default("portal"),
    answers: jsonb("answers"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedByMembershipId: uuid("reviewed_by_membership_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    applied: jsonb("applied"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("intake_requests_patient_idx").on(table.patientId, table.createdAt.desc()),
    foreignKey({ columns: [table.tenantId], foreignColumns: [organizations.id], name: "intake_requests_tenant_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.patientId], foreignColumns: [patients.id], name: "intake_requests_patient_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.requestedByMembershipId], foreignColumns: [memberships.id], name: "intake_requests_requested_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.reviewedByMembershipId], foreignColumns: [memberships.id], name: "intake_requests_reviewed_by_fk" }).onDelete("restrict"),
  ],
);

export type IntakeRequestRow = typeof intakeRequests.$inferSelect;
