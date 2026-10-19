import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

import { users } from "./users.js";

/**
 * Pedido de recuperación de contraseña (ADR 0029). Plano de control como `users`:
 * sin tenant ni RLS, y el rol app NO tiene grants (lo opera la conexión owner del
 * flujo de auth). Un solo uso, vence en minutos; en DB sólo el hash del token.
 */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("password_resets_user_idx").on(table.userId, table.createdAt)],
);
