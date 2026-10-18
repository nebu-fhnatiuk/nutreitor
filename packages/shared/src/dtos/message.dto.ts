import { z } from "zod";

import type { MembershipRole } from "./auth.dto.js";

/**
 * Conversaciones PRIVADAS por par (ADR 0024, reemplaza la de equipo de ADR 0022):
 *  - patient_professional: paciente ↔ un profesional asignado (la admin NO la ve);
 *  - professional_admin: un profesional ↔ la administración (los otros profesionales no).
 * Mensajes append-only; el cliente consulta con polling (`after`).
 */
export const conversationKinds = ["patient_professional", "professional_admin"] as const;
export type ConversationKind = (typeof conversationKinds)[number];

export const MESSAGE_MAX_LENGTH = 2000;

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Escribí un mensaje.").max(MESSAGE_MAX_LENGTH),
});
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const messagesQuerySchema = z.object({
  /** Sólo mensajes desde este instante (inclusive; el cliente deduplica por id). */
  after: z.string().datetime({ offset: true }).optional(),
});
export type MessagesQueryDto = z.infer<typeof messagesQuerySchema>;

export interface MessageDto {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string; role: MembershipRole };
  /** Lo escribió quien consulta. */
  mine: boolean;
}

export interface ThreadDto {
  messages: MessageDto[];
  /** No leídos por quien consulta (antes de marcar como leído). */
  unread: number;
  /** Quien consulta puede escribir (asignación activa, ficha activa…). */
  canSend: boolean;
}

/**
 * Una fila de la bandeja. `conversationId` null = todavía no hay conversación con
 * esa persona (se crea al abrirla). `with` dice con quién es.
 */
export interface InboxEntryDto {
  conversationId: string | null;
  kind: ConversationKind;
  /** Con quién: paciente (para el profesional), profesional (para paciente y admin) o la administración. */
  title: string;
  patientId: string | null;
  professionalMembershipId: string;
  lastMessage: { body: string; createdAt: string; mine: boolean } | null;
  unread: number;
}

export interface UnreadDto {
  total: number;
}

export interface ConversationRefDto {
  conversationId: string;
}

/** Fusiona mensajes nuevos (polling) sin duplicar, en orden cronológico. */
export function mergeMessages(current: MessageDto[], incoming: MessageDto[]): MessageDto[] {
  const seen = new Set(current.map((m) => m.id));
  const added = incoming.filter((m) => !seen.has(m.id));
  if (!added.length) return current;
  return [...current, ...added].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
