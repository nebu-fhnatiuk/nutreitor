import { sql } from "drizzle-orm";
import { pgTable, uuid, text, jsonb, timestamp, index, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";

/**
 * Plantillas de planes del consultorio (Fase 4.2): un plan reutilizable como punto
 * de partida. `body` = misma forma que meal_plans.body (se valida con el schema del
 * plan en shared). Tenant-scoped bajo RLS; sin DELETE, se archiva.
 */
export const planTemplates = pgTable(
  "plan_templates",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    name: text("name").notNull(),
    description: text("description"),
    body: jsonb("body").$type<Record<string, unknown>>().notNull(),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("plan_templates_tenant_idx").on(table.tenantId),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "plan_templates_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.createdByMembershipId],
      foreignColumns: [memberships.id],
      name: "plan_templates_created_by_membership_id_fk",
    }).onDelete("restrict"),
  ],
);
