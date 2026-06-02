import { sql } from "drizzle-orm";
import { pgTable, uuid, text } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared.js";

/**
 * Identidad de plataforma. NO es una tabla de tenant: no lleva `tenant_id` ni
 * `region` y NO está bajo RLS. Guarda sólo la credencial y el nombre — nunca PHI.
 *
 * `email` es único GLOBAL: una persona = una credencial, que puede pertenecer a N
 * organizaciones vía `memberships`. El aislamiento multi-tenant no vive acá sino
 * en memberships y en las tablas de negocio (tenant-scoped, RLS).
 */
export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  hashedPassword: text("hashed_password").notNull(),
  fullName: text("full_name").notNull(),
  ...timestamps,
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
