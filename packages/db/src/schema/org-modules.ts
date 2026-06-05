import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, foreignKey, unique } from "drizzle-orm/pg-core";

import { tenantColumns } from "./_shared.js";
import { organizations } from "./organizations.js";

/**
 * Módulos/complementos instalables por organización (entitlements a nivel tenant).
 * Ortogonal a las capacidades por rol: el gateway exige el módulo ACTIVO además de
 * la capability. Ver migración 0025 y ADR 0016. Hoy el único módulo es 'agents'.
 */
export const orgModules = pgTable(
  "org_modules",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ...tenantColumns,
    module: text("module").notNull(),
    /** active | inactive (text para no acoplar el ciclo de vida a un enum). */
    status: text("status").notNull().default("inactive"),
    plan: text("plan"),
    termsVersion: text("terms_version"),
    installedByMembershipId: uuid("installed_by_membership_id"),
    installedAt: timestamp("installed_at", { withTimezone: true }),
    uninstalledAt: timestamp("uninstalled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    unique("org_modules_tenant_module_uq").on(table.tenantId, table.module),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "org_modules_tenant_id_fk",
    }).onDelete("cascade"),
  ],
);

export type OrgModule = typeof orgModules.$inferSelect;
