import { sql } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

import { regionEnum } from "./_region.js";
import { timestamps } from "./_shared.js";

/** Ciclo de vida de una org (ADR 0025): el alta autoservicio queda en revisión. */
export const orgStatus = pgEnum("org_status", [
  "pending_review",
  "active",
  "rejected",
  "suspended",
]);

/** Equipo, o profesional independiente (org de una persona). */
export const orgKind = pgEnum("org_kind", ["team", "individual"]);

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
    // Branding white-label (acotado): nombre visible + logo + colores. Servido por
    // tenant al front. NO es un theming engine.
    displayName: text("display_name"),
    brandLogoUrl: text("brand_logo_url"),
    brandPrimaryColor: text("brand_primary_color"),
    brandSecondaryColor: text("brand_secondary_color"),
    // Página pública de la org (capa de captación).
    publicHeadline: text("public_headline"),
    publicDescription: text("public_description"),
    status: orgStatus("status").notNull().default("active"),
    kind: orgKind("kind").notNull().default("team"),
    /** Motivo del rechazo/suspensión (lo ve la admin de la org). */
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("organizations_slug_idx").on(table.slug)],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
