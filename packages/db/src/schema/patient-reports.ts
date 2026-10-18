import { sql } from "drizzle-orm";
import { pgEnum, pgTable, uuid, text, date, jsonb, timestamp, index, unique, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

export const patientReportStatus = pgEnum("patient_report_status", ["draft", "published"]);

/**
 * Reporte mensual del paciente (Fase 4.4): `data` es una foto de los números del mes
 * (se actualiza en borrador; publicado queda fijo) + el comentario del profesional.
 */
export const patientReports = pgTable(
  "patient_reports",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    /** Primer día del mes que cubre (YYYY-MM-01). */
    period: date("period").notNull(),
    status: patientReportStatus("status").notNull().default("draft"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    comment: text("comment"),
    authorMembershipId: uuid("author_membership_id").notNull(),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("patient_reports_tenant_idx").on(table.tenantId),
    unique("patient_reports_one_per_month").on(table.patientId, table.period),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "patient_reports_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "patient_reports_patient_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.authorMembershipId],
      foreignColumns: [memberships.id],
      name: "patient_reports_author_membership_id_fk",
    }).onDelete("restrict"),
  ],
);
