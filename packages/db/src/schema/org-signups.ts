import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

import { regionEnum } from "./_region.js";
import { orgKind, organizations } from "./organizations.js";

/**
 * Solicitud de alta de organización pendiente de verificar el email (ADR 0025).
 * Plano de control, como `users`: sin tenant ni RLS, y el rol app NO tiene grants
 * (la opera sólo la conexión owner). Al confirmar se crea la org en
 * `pending_review` y queda `completed_at` + `organization_id`.
 */
export const orgSignups = pgTable(
  "org_signups",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    orgName: text("org_name").notNull(),
    slug: text("slug").notNull(),
    region: regionEnum("region").notNull(),
    kind: orgKind("kind").notNull(),
    licenseNumber: text("license_number"),
    licenseJurisdiction: text("license_jurisdiction"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("org_signups_email_idx").on(table.email, table.createdAt)],
);

export type OrgSignup = typeof orgSignups.$inferSelect;
