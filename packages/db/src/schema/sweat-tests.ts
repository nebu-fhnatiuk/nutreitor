import { sql } from "drizzle-orm";
import { pgTable, uuid, text, date, integer, numeric, timestamp, index, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patientGroups } from "./patient-groups.js";
import { patients } from "./patients.js";

/**
 * Prueba de sudoración (ADR 0036). Resultados y plan de líquidos al leer. `groupId`
 * marca las cargadas por plantel. RLS `tenant_isolation`.
 */
export const sweatTests = pgTable(
  "sweat_tests",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    recordedByMembershipId: uuid("recorded_by_membership_id").notNull(),
    groupId: uuid("group_id"),
    measuredOn: date("measured_on").notNull(),
    sessionLabel: text("session_label"),
    durationMin: integer("duration_min").notNull(),
    temperatureC: numeric("temperature_c", { precision: 4, scale: 1 }),
    humidityPct: integer("humidity_pct"),
    preWeightKg: numeric("pre_weight_kg", { precision: 5, scale: 2 }).notNull(),
    postWeightKg: numeric("post_weight_kg", { precision: 5, scale: 2 }).notNull(),
    fluidIntakeMl: integer("fluid_intake_ml").notNull(),
    urineMl: integer("urine_ml").notNull().default(0),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sweat_tests_patient_idx").on(table.patientId, table.measuredOn),
    foreignKey({ columns: [table.tenantId], foreignColumns: [organizations.id], name: "sweat_tests_tenant_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.patientId], foreignColumns: [patients.id], name: "sweat_tests_patient_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.recordedByMembershipId], foreignColumns: [memberships.id], name: "sweat_tests_recorded_by_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.groupId], foreignColumns: [patientGroups.id], name: "sweat_tests_group_id_fk" }).onDelete("set null"),
  ],
);
