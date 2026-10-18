import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  date,
  smallint,
  timestamp,
  index,
  foreignKey,
  unique,
} from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { mealPlans } from "./meal-plans.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

export const adherenceStatus = pgEnum("adherence_status", ["done", "partial", "skipped"]);

/**
 * Adherencia por comida (Fase 4.3): el paciente marca cada comida del plan de un día.
 * Una fila por (paciente, fecha, comida); se corrige con upsert, sin DELETE.
 */
export const adherenceMealLogs = pgTable(
  "adherence_meal_logs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    date: date("date").notNull(),
    mealName: text("meal_name").notNull(),
    status: adherenceStatus("status").notNull(),
    note: text("note"),
    planId: uuid("plan_id"),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("adherence_meal_logs_tenant_idx").on(table.tenantId),
    unique("adherence_meal_logs_unique").on(table.patientId, table.date, table.mealName),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "adherence_meal_logs_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "adherence_meal_logs_patient_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.planId],
      foreignColumns: [mealPlans.id],
      name: "adherence_meal_logs_plan_id_fk",
    }).onDelete("set null"),
  ],
);

/** Sensación del día (hambre, energía, ánimo 1–5): una fila por (paciente, fecha). */
export const adherenceCheckins = pgTable(
  "adherence_checkins",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    date: date("date").notNull(),
    hunger: smallint("hunger"),
    energy: smallint("energy"),
    mood: smallint("mood"),
    note: text("note"),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("adherence_checkins_tenant_idx").on(table.tenantId),
    unique("adherence_checkins_unique").on(table.patientId, table.date),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "adherence_checkins_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "adherence_checkins_patient_id_fk",
    }).onDelete("cascade"),
  ],
);
