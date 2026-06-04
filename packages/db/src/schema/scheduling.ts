import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  smallint,
  timestamp,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/**
 * Agendamiento (motor propio). Dos tablas tenant-scoped bajo RLS:
 *  - availability_rules: ventanas de disponibilidad semanal del profesional, con
 *    su huso IANA. Los slots libres se derivan de acá (ver módulo scheduling).
 *  - appointments: citas. starts_at/ends_at en UTC; la conversión a huso es de
 *    presentación. El no-overlap por profesional lo fuerza la DB (EXCLUDE gist,
 *    definido en la migración 0022 — Drizzle no modela EXCLUDE).
 */

export const appointmentStatus = pgEnum("appointment_status", [
  "booked",
  "cancelled",
  "completed",
  "no_show",
]);
export const appointmentBookedVia = pgEnum("appointment_booked_via", [
  "professional",
  "patient",
  "public",
]);

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    membershipId: uuid("membership_id").notNull(),
    /** Huso IANA en el que el profesional define sus horarios. */
    timezone: text("timezone").notNull(),
    /** Día ISO: 1=lunes … 7=domingo. */
    weekday: smallint("weekday").notNull(),
    /** Minutos desde medianoche, en el huso del profesional. */
    startMinute: smallint("start_minute").notNull(),
    endMinute: smallint("end_minute").notNull(),
    /** Largo del slot en minutos. */
    slotMinutes: smallint("slot_minutes").notNull(),
    ...timestamps,
  },
  (table) => [
    index("availability_rules_membership_idx").on(table.membershipId, table.weekday),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "availability_rules_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.membershipId],
      foreignColumns: [memberships.id],
      name: "availability_rules_membership_id_fk",
    }).onDelete("cascade"),
  ],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    /** Inicio/fin como instantes UTC (timestamptz). La duración se deriva. */
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: appointmentStatus("status").notNull().default("booked"),
    bookedVia: appointmentBookedVia("booked_via").notNull().default("professional"),
    createdByMembershipId: uuid("created_by_membership_id"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("appointments_membership_starts_idx").on(table.membershipId, table.startsAt),
    index("appointments_patient_idx").on(table.patientId, table.startsAt),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "appointments_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "appointments_patient_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.membershipId],
      foreignColumns: [memberships.id],
      name: "appointments_membership_id_fk",
    }).onDelete("restrict"),
    // El EXCLUDE gist anti-overlap vive en la migración 0022 (Drizzle no lo modela).
  ],
);

export type AvailabilityRule = typeof availabilityRules.$inferSelect;
export type NewAvailabilityRule = typeof availabilityRules.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
