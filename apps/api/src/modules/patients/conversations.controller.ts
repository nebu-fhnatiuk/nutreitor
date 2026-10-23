import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  messagesQuerySchema,
  sendMessageSchema,
  type ConversationRefDto,
  type InboxEntryDto,
  type MessageDto,
  type MessagesQueryDto,
  type SendMessageDto,
  type ThreadDto,
  type UnreadDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { ConversationsService } from "./conversations.service.js";
import { LogsAccess } from "../../core/audit/access-log.decorator.js";

/**
 * Conversaciones del equipo (ADR 0024). Profesional: con sus pacientes y con la
 * administración. Admin: con cada profesional (NO con pacientes). Quién participa
 * de cada conversación lo decide el service (404 si no).
 */
@Controller("conversations")
@UseGuards(JwtAuthGuard, CapabilityGuard)
@RequireCapability("message:send")
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  inbox(): Promise<InboxEntryDto[]> {
    return this.conversations.inbox();
  }

  @Get("unread")
  unread(): Promise<UnreadDto> {
    return this.conversations.unread();
  }

  @Post("patient/:patientId")
  openWithPatient(@Param("patientId", new ParseUUIDPipe()) patientId: string): Promise<ConversationRefDto> {
    return this.conversations.openWithPatient(patientId);
  }

  @Post("admin")
  openWithAdmin(): Promise<ConversationRefDto> {
    return this.conversations.openWithAdmin();
  }

  @Post("professional/:membershipId")
  openWithProfessional(
    @Param("membershipId", new ParseUUIDPipe()) membershipId: string,
  ): Promise<ConversationRefDto> {
    return this.conversations.openWithProfessional(membershipId);
  }

  @Get(":id/messages")
  @LogsAccess("conversation", { targetParam: "id", patientFromConversation: true })
  thread(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(messagesQuerySchema)) q: MessagesQueryDto,
  ): Promise<ThreadDto> {
    return this.conversations.thread(id, q);
  }

  @Post(":id/messages")
  send(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.conversations.send(id, dto.body);
  }

  @Post(":id/read")
  @HttpCode(204)
  read(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    return this.conversations.markRead(id);
  }
}
