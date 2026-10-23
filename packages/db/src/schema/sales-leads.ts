import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users.js";

/**
 * Consulta comercial desde la landing (KAN-80, ADR 0041). Plano de control, como
 * `org_signups`: sin tenant ni RLS, y el rol app NO tiene grants (la opera sólo la
 * conexión owner). Los valores de `orgKind`, `role`, `athletes` y `status` los
 * acotan CHECKs en la migración y los enums de `lead.dto.ts`.
 */
export const salesLeads = pgTable(
  "sales_leads",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    orgName: text("org_name").notNull(),
    orgKind: text("org_kind").notNull(),
    role: text("role").notNull(),
    athletes: text("athletes").notNull(),
    message: text("message"),
    status: text("status").notNull().default("new"),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sales_leads_status_idx").on(table.status, table.createdAt)],
);

export type SalesLead = typeof salesLeads.$inferSelect;
