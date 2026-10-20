import { sql } from "drizzle-orm";
import { pgTable, uuid, text, date, boolean, jsonb, timestamp, index, foreignKey } from "drizzle-orm/pg-core";

import { tenantColumns } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/**
 * Recordatorio de 24 h (ADR 0033). `meals` con la forma de las comidas del plan
 * (validado por `saveRecallSchema`); totales derivados al leer. RLS `tenant_isolation`.
 */
export const dietaryRecalls = pgTable(
  "dietary_recalls",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    patientId: uuid("patient_id").notNull(),
    recordedByMembershipId: uuid("recorded_by_membership_id").notNull(),
    recalledDate: date("recalled_date").notNull(),
    typical: boolean("typical").notNull(),
    dayLabel: text("day_label"),
    meals: jsonb("meals").$type<unknown[]>().notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("dietary_recalls_patient_idx").on(table.patientId, table.recalledDate),
    foreignKey({ columns: [table.tenantId], foreignColumns: [organizations.id], name: "dietary_recalls_tenant_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.patientId], foreignColumns: [patients.id], name: "dietary_recalls_patient_id_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.recordedByMembershipId], foreignColumns: [memberships.id], name: "dietary_recalls_recorded_by_fk" }).onDelete("restrict"),
  ],
);
