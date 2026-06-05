import { z } from "zod";

/**
 * Agentes de IA. El front habla con el gateway Nest (auth + capacidad + tenant);
 * el gateway reenvía al servicio Python con contexto firmado (ver ADR 0013). PSICO
 * llega en su fase; el schema ya contempla los tres `kind`.
 */

export const agentKinds = ["nutri", "chef", "psico"] as const;
export type AgentKind = (typeof agentKinds)[number];

/**
 * Quién opera cada agente:
 *  - PRO (profesional): NUTRI, sobre la ficha del paciente; output = borrador a revisar.
 *  - PORTAL (paciente): CHEF y PSICO, sobre la PROPIA ficha. PSICO es supervisado
 *    (requiere profesional asignado) y ambos requieren consentimiento. Ver ADR 0015.
 */
export const proAgentKinds = ["nutri"] as const;
export const patientAgentKinds = ["chef", "psico"] as const;
export type PatientAgentKind = (typeof patientAgentKinds)[number];

export type AgentMessageRole = "user" | "assistant";

/** Mensaje del PROFESIONAL a NUTRI, en el contexto de un paciente. */
export const agentChatSchema = z.object({
  agent: z.enum(proAgentKinds),
  patientId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});
export type AgentChatDto = z.infer<typeof agentChatSchema>;

/** Mensaje del PACIENTE a un agente del portal. Sin patientId: es SIEMPRE su ficha. */
export const portalAgentChatSchema = z.object({
  agent: z.enum(patientAgentKinds),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});
export type PortalAgentChatDto = z.infer<typeof portalAgentChatSchema>;

/** Versión vigente del texto de consentimiento de asistentes del portal. */
export const AGENT_CONSENT_VERSION = "2026-06-05";

/** Estado del consentimiento del paciente para los asistentes del portal. */
export interface AgentConsentDto {
  accepted: boolean;
  version: string | null;
  acceptedAt: string | null;
}

export interface AgentMessageDto {
  id: string;
  role: AgentMessageRole;
  content: string;
  createdAt: string;
}

/** Respuesta del agente (más el id de conversación para continuar el hilo). */
export interface AgentChatResponse {
  conversationId: string;
  reply: string;
  /** ok | blocked (guardrail) | error — para que la UI reaccione. */
  status: "ok" | "blocked" | "error";
  /** PSICO detectó una posible crisis: la UI muestra recursos de emergencia y se
   *  notifica al profesional asignado. El `reply` ya trae el mensaje de contención. */
  crisis?: boolean;
}

// ── Supervisión (lado profesional) ──────────────────────────────────────────────

/** Resumen de una conversación de agente de un paciente, para el profesional asignado. */
export interface AgentConversationSummaryDto {
  id: string;
  agent: AgentKind;
  createdAt: string;
  messageCount: number;
  /** Hubo al menos un run marcado como crisis en esta conversación. */
  crisis: boolean;
  lastMessageAt: string | null;
}

/** Una conversación con sus mensajes, para que el profesional la lea. */
export interface AgentConversationDetailDto {
  id: string;
  agent: AgentKind;
  crisis: boolean;
  messages: AgentMessageDto[];
}
