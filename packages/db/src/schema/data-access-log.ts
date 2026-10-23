import { sql } from "drizzle-orm";
import { foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { regionEnum } from "./_region.js";
import { membershipRole } from "./memberships.js";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

/** Qué se leyó (CHECK en la migración 0049). */
export const accessResources = [
  "patient",
  "patient_notes",
  "assignments",
  "metrics",
  "anthropometry",
  "plan",
  "recalls",
  "food_frequency",
  "sweat_tests",
  "energy",
  "adherence",
  "reports",
  "report",
  "conversation",
  "group_board",
] as const;
export type AccessResource = (typeof accessResources)[number];

/**
 * Registro de lecturas de datos de salud por el staff (KAN-23, ADR 0042).
 * Append-only por grant (rol app: INSERT + SELECT) y tenant-scoped por RLS.
 * Una fila por persona/recurso/deportista/objeto cada 15 min (`windowStart`).
 * `patientId` sin FK: el rastro sobrevive al borrado del deportista.
 */
export const dataAccessLog = pgTable(
  "data_access_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").notNull(),
    region: regionEnum("region").notNull(),
    actorUserId: uuid("actor_user_id"),
    actorRole: membershipRole("actor_role").notNull(),
    resource: text("resource").$type<AccessResource>().notNull(),
    patientId: uuid("patient_id"),
    targetId: uuid("target_id"),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // En SQL es un índice único NULLS NOT DISTINCT; el insert usa ON CONFLICT DO NOTHING.
    unique("data_access_log_window_uq")
      .on(table.tenantId, table.actorUserId, table.resource, table.patientId, table.targetId, table.windowStart)
      .nullsNotDistinct(),
    index("data_access_log_patient_idx").on(table.tenantId, table.patientId, table.createdAt.desc()),
    index("data_access_log_created_idx").on(table.tenantId, table.createdAt.desc()),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "data_access_log_tenant_id_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.actorUserId],
      foreignColumns: [users.id],
      name: "data_access_log_actor_user_id_fk",
    }).onDelete("set null"),
  ],
);

export type DataAccessLogRow = typeof dataAccessLog.$inferSelect;
