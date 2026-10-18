import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  date,
  integer,
  jsonb,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/** Cuerpo del plan como documento (comidas → items). Tipado local para no acoplar
 * el paquete db con shared; shared expone el mismo shape para los DTOs. */
type Macros = { protein_g?: number; carbs_g?: number; fat_g?: number; kcal?: number };
type MealAlternative = { text: string; qty?: number; unit?: string };
type MealItem = {
  text: string;
  qty?: number;
  unit?: string;
  alternatives?: MealAlternative[];
  macros?: Macros;
  note?: string;
};
type PlanMeal = { name: string; time?: string; items: MealItem[] };
type DayPlan = { meals: PlanMeal[] };
type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type MealPlanBody =
  | { layout: "day"; day: DayPlan; targets?: Macros; generalNotes?: string }
  | {
      layout: "week";
      days: Partial<Record<Weekday, DayPlan>>;
      targets?: Macros;
      generalNotes?: string;
    };

export const mealPlanStatus = pgEnum("meal_plan_status", [
  "active",
  "superseded",
  "archived",
]);

/**
 * Plan alimentario VERSIONADO. Un plan activo por paciente; revisarlo = supersede
 * del activo + nueva versión activa (se conserva el historial de qué comía y
 * cuándo). El cuerpo es un documento JSONB (comidas → items): flexible, sin churn
 * de schema. Sin DELETE (GRANT sin DELETE): la historia no se borra.
 *
 * Tenant-scoped bajo RLS `tenant_isolation` sobre `tenant_id`.
 */
export const mealPlans = pgTable(
  "meal_plans",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    authorMembershipId: uuid("author_membership_id").notNull(),
    version: integer("version").notNull(),
    status: mealPlanStatus("status").notNull().default("active"),
    title: text("title").notNull(),
    /** Segundos de armado (editor abierto → guardar; tope 2 h). Métricas de eficiencia. */
    editSeconds: integer("edit_seconds"),
    /** Desde qué se armó: scratch | previous | template | nutri. */
    draftedFrom: text("drafted_from"),
    startDate: date("start_date"),
    body: jsonb("body")
      .$type<MealPlanBody>()
      .notNull()
      .default(sql`'{"layout":"day","day":{"meals":[]}}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index("meal_plans_patient_idx").on(table.patientId, table.version),
    // Un único plan ACTIVO por paciente.
    uniqueIndex("meal_plans_active_unique")
      .on(table.patientId)
      .where(sql`status = 'active'`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "meal_plans_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "meal_plans_patient_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.authorMembershipId],
      foreignColumns: [memberships.id],
      name: "meal_plans_author_membership_id_fk",
    }).onDelete("restrict"),
  ],
);

export type MealPlan = typeof mealPlans.$inferSelect;
export type NewMealPlan = typeof mealPlans.$inferInsert;
