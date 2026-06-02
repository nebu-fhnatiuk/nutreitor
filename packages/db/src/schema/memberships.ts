import { sql } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, unique, index, foreignKey } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared.js";
import { users } from "./users.js";
import { organizations } from "./organizations.js";

/** Roles dentro de una organización. */
export const membershipRole = pgEnum("membership_role", [
  "admin",
  "professional",
  "patient",
]);

export type MembershipRole = (typeof membershipRole.enumValues)[number];

/**
 * Pertenencia de un usuario (global) a una organización (tenant), con su rol.
 * Es la pieza que hace multi-org: un usuario puede tener N memberships.
 *
 * `organizationId` ES el tenant: la policy RLS aísla por esta columna (igual que
 * `tenant_id` en el resto). UNIQUE(userId, organizationId): un rol por org por user.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    role: membershipRole("role").notNull(),
    region: text("region").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("memberships_user_org_unique").on(table.userId, table.organizationId),
    index("memberships_org_idx").on(table.organizationId),
    index("memberships_user_idx").on(table.userId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "memberships_user_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: "memberships_organization_id_fk",
    }).onDelete("cascade"),
  ],
);

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
