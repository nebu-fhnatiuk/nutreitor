import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";

import { regionEnum } from "./_region.js";
import { timestamps } from "./_shared.js";
import { membershipRole } from "./memberships.js";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

/**
 * Audit log append-only de acciones administrativas. Tenant-scoped por
 * `organizationId` (RLS). La inmutabilidad se fuerza a nivel rol: al rol de
 * runtime sólo se le otorga INSERT+SELECT (sin UPDATE/DELETE) — ver migración.
 *
 * Sin PII innecesaria: `targetId` referencia por id (la fila destino ya tiene los
 * datos); `metadata` lleva sólo lo mínimo (ej. {fromRole,toRole}).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id").notNull(),
    region: regionEnum("region").notNull(),
    actorUserId: uuid("actor_user_id"),
    actorRole: membershipRole("actor_role"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index("audit_log_org_created_idx").on(table.organizationId, table.createdAt),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: "audit_log_organization_id_fk",
      // RESTRICT: el audit no se destruye por cascade al borrar la org (inmutable).
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.actorUserId],
      foreignColumns: [users.id],
      name: "audit_log_actor_user_id_fk",
    }).onDelete("set null"),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
