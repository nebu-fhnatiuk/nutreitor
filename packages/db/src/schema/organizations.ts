import { sql } from "drizzle-orm";
import { pgTable, uuid, text, index } from "drizzle-orm/pg-core";

import { regionEnum } from "./_region.js";
import { timestamps } from "./_shared.js";

/**
 * Tabla raíz de tenant. Cada organización ES un tenant en el modelo POOL.
 *
 * No lleva `tenant_id` (es ella misma el tenant); sí lleva `region` y `slug`.
 * El `slug` mapea al subdominio para el white-label y la capa pública.
 *
 * RLS: a diferencia de las tablas de negocio, la policy compara `id` contra el
 * tenant del contexto (una org sólo se ve a sí misma en runtime). El alta de
 * organizaciones es una operación de administración que corre con el rol owner
 * (bypassa RLS). Ver migrations/0001_roles_and_rls.sql.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    region: regionEnum("region").notNull(),
    ...timestamps,
  },
  (table) => [index("organizations_slug_idx").on(table.slug)],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
