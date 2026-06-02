import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, index, foreignKey } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared.js";
import { users } from "./users.js";
import { organizations } from "./organizations.js";

/**
 * Refresh tokens persistidos (sesiones). Tenant-scoped por `organizationId`
 * (= org activa de la sesión): bajo RLS, igual que el resto.
 *
 * Se guarda `tokenHash` = sha256(refresh), NUNCA el valor crudo. Rotación: en
 * cada refresh se revoca el anterior y se emite uno nuevo (detección de reuso).
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    region: text("region").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [
    index("refresh_tokens_user_idx").on(table.userId),
    index("refresh_tokens_org_idx").on(table.organizationId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "refresh_tokens_user_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: "refresh_tokens_organization_id_fk",
    }).onDelete("cascade"),
  ],
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
