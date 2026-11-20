import { sql } from "drizzle-orm";
import { pgTable, uuid, text, numeric, timestamp, index, unique, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns } from "./_shared.js";
import { energyRequirements } from "./energy-requirements.js";
import { mealPlans } from "./meal-plans.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/**
 * Alertas del plan registradas al guardar cada versión (KAN-97, ADR 0051): qué avisó
 * el motor y qué decidió el profesional (`kept` con motivo, o `unreviewed`).
 * Append-only (GRANT sin UPDATE ni DELETE). RLS `tenant_isolation`.
 */
export const planAlertReviews = pgTable(
  "plan_alert_reviews",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    mealPlanId: uuid("meal_plan_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    energyRequirementId: uuid("energy_requirement_id"),
    rule: text("rule").notNull(),
    level: text("level").$type<"important" | "info">().notNull(),
    day: text("day").notNull(),
    dayLabel: text("day_label").notNull(),
    message: text("message").notNull(),
    source: text("source").notNull(),
    value: numeric("value").notNull(),
    decision: text("decision").$type<"kept" | "unreviewed">().notNull(),
    reason: text("reason"),
    decidedByMembershipId: uuid("decided_by_membership_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("plan_alert_reviews_patient_idx").on(table.patientId, table.createdAt),
    unique("plan_alert_reviews_plan_rule_day_uq").on(table.mealPlanId, table.rule, table.day),
    foreignKey({ columns: [table.tenantId], foreignColumns: [organizations.id], name: "plan_alert_reviews_tenant_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.mealPlanId], foreignColumns: [mealPlans.id], name: "plan_alert_reviews_meal_plan_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.patientId], foreignColumns: [patients.id], name: "plan_alert_reviews_patient_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.energyRequirementId], foreignColumns: [energyRequirements.id], name: "plan_alert_reviews_energy_requirement_id_fk" }).onDelete("set null"),
    foreignKey({ columns: [table.decidedByMembershipId], foreignColumns: [memberships.id], name: "plan_alert_reviews_decided_by_fk" }).onDelete("restrict"),
  ],
);
