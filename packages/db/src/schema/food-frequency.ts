import { sql } from "drizzle-orm";
import { pgTable, uuid, text, date, jsonb, timestamp, index, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/**
 * Cuestionario de frecuencia de consumo (ADR 0034): respuestas por grupo (validadas por
 * `saveFoodFrequencySchema`); resultados al leer. RLS `tenant_isolation`.
 */
export const foodFrequencySurveys = pgTable(
  "food_frequency_surveys",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    recordedByMembershipId: uuid("recorded_by_membership_id").notNull(),
    answeredOn: date("answered_on").notNull(),
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("food_frequency_surveys_patient_idx").on(table.patientId, table.answeredOn),
    foreignKey({ columns: [table.tenantId], foreignColumns: [organizations.id], name: "food_frequency_surveys_tenant_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.patientId], foreignColumns: [patients.id], name: "food_frequency_surveys_patient_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.recordedByMembershipId], foreignColumns: [memberships.id], name: "food_frequency_surveys_recorded_by_fk" }).onDelete("restrict"),
  ],
);
