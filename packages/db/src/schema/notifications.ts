import { sql } from "drizzle-orm";
import { pgTable, uuid, text, boolean, smallint, timestamp, primaryKey, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns } from "./_shared.js";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

/**
 * Preferencias de avisos por usuario y consultorio (Fase 4.3). Hoy: el recordatorio
 * diario de registro de adherencia (opt-in). Las lee el worker (ADR 0023).
 * La tabla `notifications` (registro de envíos) la escribe sólo el worker por SQL.
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    ...tenantColumns,
    userId: uuid("user_id").notNull(),
    adherenceReminder: boolean("adherence_reminder").notNull().default(false),
    adherenceReminderHour: smallint("adherence_reminder_hour").notNull().default(21),
    timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId] }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "notification_preferences_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "notification_preferences_user_id_fk",
    }).onDelete("cascade"),
  ],
);
