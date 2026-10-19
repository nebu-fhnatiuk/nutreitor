import { sql } from "drizzle-orm";
import { pgTable, uuid, text, date, jsonb, timestamp, index, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/**
 * Sesión de antropometría ISAK (ADR 0030). Sólo las tomas crudas por sitio; los
 * resultados se calculan al leer. Tenant-scoped bajo RLS `tenant_isolation`.
 */
export const anthropometrySessions = pgTable(
  "anthropometry_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    measuredByMembershipId: uuid("measured_by_membership_id").notNull(),
    measuredAt: date("measured_at").notNull(),
    profile: text("profile").notNull().default("isak_restricted"),
    /** Clave de sitio → 1 a 3 tomas (validado por `saveAnthropometrySchema`). */
    takes: jsonb("takes").$type<Record<string, number[]>>().notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("anthropometry_sessions_patient_idx").on(table.patientId, table.measuredAt),
    foreignKey({ columns: [table.tenantId], foreignColumns: [organizations.id], name: "anthropometry_sessions_tenant_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.patientId], foreignColumns: [patients.id], name: "anthropometry_sessions_patient_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.measuredByMembershipId], foreignColumns: [memberships.id], name: "anthropometry_sessions_measured_by_fk" }).onDelete("restrict"),
  ],
);

export type AnthropometrySession = typeof anthropometrySessions.$inferSelect;
