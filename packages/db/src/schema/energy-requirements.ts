import { sql } from "drizzle-orm";
import { pgTable, uuid, text, jsonb, timestamp, index, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/**
 * Requerimiento energético (ADR 0032): versión append-only con las ENTRADAS (validadas
 * por `saveEnergySchema`); los resultados se calculan al leer. RLS `tenant_isolation`.
 */
export const energyRequirements = pgTable(
  "energy_requirements",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("energy_requirements_patient_idx").on(table.patientId, table.createdAt),
    foreignKey({ columns: [table.tenantId], foreignColumns: [organizations.id], name: "energy_requirements_tenant_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.patientId], foreignColumns: [patients.id], name: "energy_requirements_patient_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.createdByMembershipId], foreignColumns: [memberships.id], name: "energy_requirements_created_by_fk" }).onDelete("restrict"),
  ],
);
