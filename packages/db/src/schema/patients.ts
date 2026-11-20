import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  date,
  integer,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { locations } from "./locations.js";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

/** Qué campos clínicos de la ficha ve el paciente en su portal (default: ninguno).
 * Tipado local para no acoplar db con shared; shared expone el mismo shape. */
type ClinicalVisibility = Partial<Record<
  | "reasonForConsult"
  | "medicalHistory"
  | "allergies"
  | "currentMedication"
  | "diagnosedConditions"
  | "familyHistory",
  boolean
>>;

/**
 * Pacientes como ENTIDAD CLÍNICA, separada de la cuenta de acceso. Lo crea un
 * profesional/admin y existe aunque el paciente nunca se loguee. Pertenece al
 * TENANT (no a un profesional): si un profesional se va, el paciente permanece y
 * es reasignable (ver care_assignments).
 *
 *  - `userId`: vínculo (nullable) a la identidad global. Se setea cuando el
 *    paciente acepta una invitación y habilita su cuenta. Sin cuenta = NULL.
 *  - `archivedAt`: baja LÓGICA (soft-delete). Nunca se borra físico.
 *  - Campos de ficha SOBRESCRIBIBLES (estado actual). La serie temporal de peso/
 *    medidas NO vive acá (sprint de métricas): sólo el antropométrico BASAL.
 *
 * Aislamiento por RLS `tenant_isolation` sobre `tenant_id` (modelo POOL).
 */
export const patients = pgTable(
  "patients",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    // Identificación / contacto
    fullName: text("full_name").notNull(),
    documentId: text("document_id"),
    birthDate: date("birth_date"),
    sex: text("sex"),
    email: text("email"),
    phone: text("phone"),
    country: text("country"),
    timezone: text("timezone"),
    // Clínicos de base
    reasonForConsult: text("reason_for_consult"),
    medicalHistory: text("medical_history"),
    allergies: text("allergies"),
    /** Casillas de alergias e intolerancias (KAN-105, migración 0055). */
    allergyFlags: text("allergy_flags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    currentMedication: text("current_medication"),
    diagnosedConditions: text("diagnosed_conditions"),
    familyHistory: text("family_history"),
    // Antropométrico BASAL
    heightCm: integer("height_cm"),
    initialWeightKg: numeric("initial_weight_kg", { precision: 5, scale: 2 }),
    // Hábitos / contexto
    activityLevel: text("activity_level"),
    goal: text("goal"),
    dietaryPreferences: text("dietary_preferences"),
    // Visibilidad por campo de la ficha clínica hacia el paciente (portal).
    // Default `{}` = todo oculto (conservador): se habilita campo por campo.
    /** Perfil deportivo (KAN-60): deporte, posición, entrenamiento… (0051). */
    sportProfile: jsonb("sport_profile"),
    /** De dónde vino cada dato: autorreportado y revisado por quién (0051). */
    fieldSources: jsonb("field_sources").notNull().default(sql`'{}'::jsonb`),
    clinicalVisibility: jsonb("clinical_visibility")
      .$type<ClinicalVisibility>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // Sede (referencia; sin UI en este sprint) + cuenta + baja lógica
    locationId: uuid("location_id"),
    userId: uuid("user_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    ...timestamps,
  },
  (table) => [
    index("patients_tenant_id_idx").on(table.tenantId),
    index("patients_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("patients_user_id_idx").on(table.userId),
    // Una cuenta se vincula a UNA sola entidad paciente por tenant (el portal
    // resuelve "mi paciente" por user_id; sin esto el match sería ambiguo).
    uniqueIndex("patients_tenant_user_unique")
      .on(table.tenantId, table.userId)
      .where(sql`user_id IS NOT NULL`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "patients_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "patients_user_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.locationId],
      foreignColumns: [locations.id],
      name: "patients_location_id_fk",
    }).onDelete("set null"),
  ],
);

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
