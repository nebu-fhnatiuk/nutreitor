import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  messagesQuerySchema,
  sendMessageSchema,
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
import { MessagesService } from "./messages.service.js";

/** Conversación con un paciente (lado equipo). El scoping fino lo hace el service. */
@Controller("patients/:patientId/messages")
@UseGuards(JwtAuthGuard, CapabilityGuard)
@RequireCapability("message:send")
export class PatientMessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  thread(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Query(new ZodValidationPipe(messagesQuerySchema)) q: MessagesQueryDto,
  ): Promise<ThreadDto> {
    return this.messages.threadForPatient(patientId, q);
  }

  @Post()
  send(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.messages.sendAsTeam(patientId, dto.body);
  }

  @Post("read")
  @HttpCode(204)
  read(@Param("patientId", new ParseUUIDPipe()) patientId: string): Promise<void> {
    return this.messages.markReadAsTeam(patientId);
  }
}

/** Bandeja de mensajes del equipo (pacientes a los que tiene acceso). */
@Controller("messages")
@UseGuards(JwtAuthGuard, CapabilityGuard)
@RequireCapability("message:send")
export class MessagesInboxController {
  constructor(private readonly messages: MessagesService) {}

  @Get("inbox")
  inbox(): Promise<InboxEntryDto[]> {
    return this.messages.inbox();
  }

  @Get("unread")
  unread(): Promise<UnreadDto> {
    return this.messages.unread();
  }
}
