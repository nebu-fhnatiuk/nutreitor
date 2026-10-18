import { z } from "zod";

import type { MembershipRole } from "./auth.dto.js";

/**
 * Chat profesional ↔ paciente (Fase 4.3). Una conversación por paciente con su
 * equipo; mensajes append-only. El cliente consulta con polling mientras la
 * conversación está abierta (`after` = createdAt del último que tiene).
 */
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
  /** El paciente puede escribir (tiene un profesional asignado activo). */
  canSend: boolean;
}

/** Bandeja del equipo: una fila por paciente con mensajes. */
export interface InboxEntryDto {
  patientId: string;
  patientName: string;
  lastMessage: { body: string; createdAt: string; fromPatient: boolean };
  unread: number;
}

export interface UnreadDto {
  total: number;
}

/** Fusiona mensajes nuevos (polling) sin duplicar, en orden cronológico. */
export function mergeMessages(current: MessageDto[], incoming: MessageDto[]): MessageDto[] {
  const seen = new Set(current.map((m) => m.id));
  const added = incoming.filter((m) => !seen.has(m.id));
  if (!added.length) return current;
  return [...current, ...added].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
