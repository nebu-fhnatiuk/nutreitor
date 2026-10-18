import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";

import { regionEnum } from "./_region.js";
import { timestamps } from "./_shared.js";
import { organizations } from "./organizations.js";
import { memberships } from "./memberships.js";

/** Matrícula: se declara y la plataforma la revisa (ADR 0025). */
export const licenseStatus = pgEnum("license_status", [
  "missing",
  "declared",
  "reviewed",
  "rejected",
]);

type ProfileService = { name: string; description?: string };

/**
 * Vidriera pública POR MEMBERSHIP (no por persona): el mismo profesional en dos
 * orgs muestra cosas distintas. Tabla aparte de `memberships` para no inflar la
 * ruta de auth caliente. Tenant-scoped (RLS por organizationId).
 *
 * `visibility` es un mapa campo→bool; vacío = TODO privado (default conservador).
 * El serializer público sólo expone un campo si visibility[campo] === true.
 */
export const professionalProfiles = pgTable(
  "professional_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id").notNull(),
    region: regionEnum("region").notNull(),
    membershipId: uuid("membership_id").notNull(),
    profileSlug: text("profile_slug").notNull(),
    isPubliclyListed: boolean("is_publicly_listed").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    specialty: text("specialty"),
    headline: text("headline"),
    bio: text("bio"),
    photoUrl: text("photo_url"),
    credentials: text("credentials"),
    specialties: jsonb("specialties")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    services: jsonb("services")
      .$type<ProfileService[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    licenseNumber: text("license_number"),
    licenseJurisdiction: text("license_jurisdiction"),
    /** Sólo `reviewed` es público (roster, perfil y reserva). */
    licenseStatus: licenseStatus("license_status").notNull().default("missing"),
    /** Motivo del rechazo (lo ve el profesional). */
    licenseNote: text("license_note"),
    visibility: jsonb("visibility")
      .$type<Record<string, boolean>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("professional_profiles_membership_unique").on(table.membershipId),
    uniqueIndex("professional_profiles_org_slug_unique").on(
      table.organizationId,
      table.profileSlug,
    ),
    index("professional_profiles_roster_idx").on(
      table.organizationId,
      table.isPubliclyListed,
      table.displayOrder,
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: "professional_profiles_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.membershipId],
      foreignColumns: [memberships.id],
      name: "professional_profiles_membership_id_fk",
    }).onDelete("cascade"),
  ],
);

export type ProfessionalProfile = typeof professionalProfiles.$inferSelect;
export type NewProfessionalProfile = typeof professionalProfiles.$inferInsert;
