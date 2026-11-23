import { foreignKey, index, primaryKey, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { tenantColumns } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patientGroups } from "./patient-groups.js";

/**
 * Planteles del cuerpo técnico (KAN-109, ADR 0054): qué grupos ve cada membresía
 * `coach`. Lo arma el admin. Tenant-scoped bajo RLS `tenant_isolation`.
 */
export const groupCoaches = pgTable(
  "group_coaches",
  {
    ...tenantColumns,
    groupId: uuid("group_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.membershipId] }),
    index("group_coaches_membership_idx").on(table.membershipId),
    foreignKey({ columns: [table.tenantId], foreignColumns: [organizations.id], name: "group_coaches_tenant_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.groupId], foreignColumns: [patientGroups.id], name: "group_coaches_group_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.membershipId], foreignColumns: [memberships.id], name: "group_coaches_membership_id_fk" }).onDelete("cascade"),
  ],
);

export type GroupCoach = typeof groupCoaches.$inferSelect;
