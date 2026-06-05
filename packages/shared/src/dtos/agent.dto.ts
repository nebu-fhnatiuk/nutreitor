import { z } from "zod";

/**
 * Agentes de IA. El front habla con el gateway Nest (auth + capacidad + tenant);
 * el gateway reenvía al servicio Python con contexto firmado (ver ADR 0013). PSICO
 * llega en su fase; el schema ya contempla los tres `kind`.
 */

export const agentKinds = ["nutri", "chef", "psico"] as const;
export type AgentKind = (typeof agentKinds)[number];

export type AgentMessageRole = "user" | "assistant";

/** Mensaje del usuario a un agente, opcionalmente en el contexto de un paciente. */
export const agentChatSchema = z.object({
  agent: z.enum(agentKinds),
  patientId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});
export type AgentChatDto = z.infer<typeof agentChatSchema>;

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
}
