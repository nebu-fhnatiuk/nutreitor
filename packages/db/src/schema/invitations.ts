import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";

import { regionEnum } from "./_region.js";
import { timestamps } from "./_shared.js";
import { membershipRole } from "./memberships.js";
import { users } from "./users.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export type InvitationStatus = (typeof invitationStatus.enumValues)[number];

/**
 * Invitación a una organización (stateful, revocable, con expiración). El token
 * se guarda hasheado (sha256); el raw sólo viaja en el link. Reenviar supersede
 * (genera token nuevo). Si trae `patientId`, al aceptar se vincula esa entidad
 * paciente con la cuenta del invitado.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id").notNull(),
    region: regionEnum("region").notNull(),
    email: text("email").notNull(),
    role: membershipRole("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    status: invitationStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    invitedByUserId: uuid("invited_by_user_id"),
    patientId: uuid("patient_id"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    /** Import en lote (KAN-43): la manda el worker, no la API (0050). */
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("invitations_org_idx").on(table.organizationId),
    index("invitations_email_idx").on(table.email),
    // A lo sumo una invitación pendiente por (org, email) — guard a nivel DB del
    // supersede (índice parcial sobre status='pending').
    uniqueIndex("invitations_pending_unique")
      .on(table.organizationId, table.email)
      .where(sql`status = 'pending'`),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: "invitations_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.invitedByUserId],
      foreignColumns: [users.id],
      name: "invitations_invited_by_user_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "invitations_patient_id_fk",
    }).onDelete("set null"),
  ],
);

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
