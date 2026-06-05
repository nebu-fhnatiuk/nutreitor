import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { organizations } from "./organizations.js";
import { patients } from "./patients.js";

/**
 * Agentes de IA (NUTRI/CHEF/PSICO). Los datos viven acá (tenant-scoped, RLS) pero
 * el que los escribe es un servicio Python separado con rol `nutreitor_agents`
 * (sin BYPASSRLS), ver ADR 0013 y migración 0023. `agent_runs` es audit append-only.
 */

export const agentKind = pgEnum("agent_kind", ["nutri", "chef", "psico"]);
export const agentMessageRole = pgEnum("agent_message_role", ["user", "assistant"]);

export const agentConversations = pgTable(
  "agent_conversations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ...tenantColumns,
    agent: agentKind("agent").notNull(),
    /** Sujeto de la charla (sobre qué paciente); nullable. */
    patientId: uuid("patient_id"),
    createdByMembershipId: uuid("created_by_membership_id"),
    ...timestamps,
  },
  (table) => [
    index("agent_conversations_patient_idx").on(table.patientId, table.createdAt),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "agent_conversations_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patients.id],
      name: "agent_conversations_patient_id_fk",
    }).onDelete("set null"),
  ],
);

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ...tenantColumns,
    conversationId: uuid("conversation_id").notNull(),
    role: agentMessageRole("role").notNull(),
    content: text("content").notNull(),
    ...timestamps,
  },
  (table) => [
    index("agent_messages_conversation_idx").on(table.conversationId, table.createdAt),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "agent_messages_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [agentConversations.id],
      name: "agent_messages_conversation_id_fk",
    }).onDelete("cascade"),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ...tenantColumns,
    conversationId: uuid("conversation_id"),
    agent: agentKind("agent").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    /** ok | error | blocked (guardrail). */
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    index("agent_runs_tenant_created_idx").on(table.tenantId, table.createdAt),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "agent_runs_tenant_id_fk",
    }).onDelete("cascade"),
  ],
);

export type AgentConversation = typeof agentConversations.$inferSelect;
export type AgentMessage = typeof agentMessages.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
