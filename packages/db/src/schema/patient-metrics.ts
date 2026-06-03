import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  date,
  numeric,
  jsonb,
  timestamp,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/**
 * Serie temporal de mediciones del paciente (evolución). A diferencia de la ficha
 * (dato basal fijo) y de las notas (append-only), las mediciones son cargas de
 * datos EDITABLES/BORRABLES (corregir un typo). Modelo wide para las métricas
 * comunes (chartable directo) + `extra` JSONB para medidas ad-hoc sin migración.
 *
 * Tenant-scoped bajo RLS `tenant_isolation` sobre `tenant_id`.
 */
export const patientMetrics = pgTable(
  "patient_metrics",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    recordedByMembershipId: uuid("recorded_by_membership_id").notNull(),
    /** Fecha de la medición (sin tz: es el día en que se midió al paciente). */
    measuredAt: date("measured_at").notNull(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),
    bodyFatPct: numeric("body_fat_pct", { precision: 4, scale: 1 }),
    muscleMassKg: numeric("muscle_mass_kg", { precision: 5, scale: 2 }),
    waistCm: numeric("waist_cm", { precision: 5, scale: 1 }),
    hipCm: numeric("hip_cm", { precision: 5, scale: 1 }),
    /** Medidas ad-hoc no modeladas como columna (clave→valor numérico). */
    extra: jsonb("extra")
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    ...timestamps,
  },
  (table) => [
    index("patient_metrics_patient_idx").on(table.patientId, table.measuredAt),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "patient_metrics_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "patient_metrics_patient_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recordedByMembershipId],
      foreignColumns: [memberships.id],
      name: "patient_metrics_recorded_by_membership_id_fk",
    }).onDelete("restrict"),
  ],
);

export type PatientMetric = typeof patientMetrics.$inferSelect;
export type NewPatientMetric = typeof patientMetrics.$inferInsert;
