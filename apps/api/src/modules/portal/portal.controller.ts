import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  adherenceRangeSchema,
  checkinSchema,
  logMealSchema,
  messagesQuerySchema,
  notificationPreferencesSchema,
  recordMetricSchema,
  sendMessageSchema,
  type AdherenceDto,
  type AdherenceRangeDto,
  type CheckinDto,
  type CheckinRecordDto,
  type LogMealDto,
  type MealLogDto,
  type ConversationRefDto,
  type InboxEntryDto,
  type MessageDto,
  type MessagesQueryDto,
  type NotificationPreferencesDto,
  type PatientReportDto,
  type SendMessageDto,
  type ThreadDto,
  type PatientMetricDto,
  type PortalAnthropometryDto,
  type PortalMeDto,
  type RecordMetricDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { AdherenceService } from "../patients/adherence.service.js";
import { ConversationsService } from "../patients/conversations.service.js";
import { ReportsService } from "../patients/reports.service.js";
import { PortalService } from "./portal.service.js";

/**
 * Portal del paciente: superficie angosta sobre la PROPIA ficha. El service
 * resuelve "mi paciente" por la sesión; nunca recibe un patientId del cliente.
 */
@Controller("portal")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly adherence: AdherenceService,
    private readonly conversations: ConversationsService,
    private readonly reports: ReportsService,
  ) {}

  @Get("me")
  @RequireCapability("portal:read")
  getMe(): Promise<PortalMeDto> {
    return this.portal.getMe();
  }

  @Get("me/adherence")
  @RequireCapability("portal:read")
  myAdherence(
    @Query(new ZodValidationPipe(adherenceRangeSchema)) range: AdherenceRangeDto,
  ): Promise<AdherenceDto> {
    return this.adherence.mine(range);
  }

  /** Marca una comida del plan (upsert por fecha + comida). */
  @Put("me/adherence/meals")
  @RequireCapability("portal:self_report")
  logMeal(@Body(new ZodValidationPipe(logMealSchema)) dto: LogMealDto): Promise<MealLogDto> {
    return this.adherence.logMeal(dto);
  }

  /** Cómo se sintió en el día (upsert por fecha). */
  @Put("me/adherence/checkin")
  @RequireCapability("portal:self_report")
  checkin(@Body(new ZodValidationPipe(checkinSchema)) dto: CheckinDto): Promise<CheckinRecordDto> {
    return this.adherence.checkin(dto);
  }

  /** Su antropometría: lo que el profesional marcó visible (ADR 0030). */
  @Get("me/anthropometry")
  @RequireCapability("portal:read")
  myAnthropometry(): Promise<PortalAnthropometryDto[]> {
    return this.portal.myAnthropometry();
  }

  /** Sus reportes mensuales PUBLICADOS. */
  @Get("me/reports")
  @RequireCapability("portal:read")
  myReports(): Promise<PatientReportDto[]> {
    return this.reports.minePublished();
  }

  @Get("me/reports/:id")
  @RequireCapability("portal:read")
  myReport(@Param("id", new ParseUUIDPipe()) id: string): Promise<PatientReportDto> {
    return this.reports.mine(id);
  }

  @Get("me/notification-preferences")
  @RequireCapability("portal:read")
  preferences(): Promise<NotificationPreferencesDto> {
    return this.adherence.preferences();
  }

  @Put("me/notification-preferences")
  @RequireCapability("portal:self_report")
  savePreferences(
    @Body(new ZodValidationPipe(notificationPreferencesSchema)) dto: NotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    return this.adherence.savePreferences(dto);
  }

  /** Sus conversaciones: una por profesional asignado (ADR 0024). */
  @Get("me/conversations")
  @RequireCapability("portal:message")
  myConversations(): Promise<InboxEntryDto[]> {
    return this.conversations.inbox();
  }

  @Post("me/conversations/professional/:membershipId")
  @RequireCapability("portal:message")
  openWithProfessional(
    @Param("membershipId", new ParseUUIDPipe()) membershipId: string,
  ): Promise<ConversationRefDto> {
    return this.conversations.openWithProfessional(membershipId);
  }

  @Get("me/conversations/:id/messages")
  @RequireCapability("portal:message")
  myThread(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(messagesQuerySchema)) q: MessagesQueryDto,
  ): Promise<ThreadDto> {
    return this.conversations.thread(id, q);
  }

  @Post("me/conversations/:id/messages")
  @RequireCapability("portal:message")
  sendMessage(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.conversations.send(id, dto.body);
  }

  @Post("me/conversations/:id/read")
  @HttpCode(204)
  @RequireCapability("portal:message")
  readMessages(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    return this.conversations.markRead(id);
  }

  @Post("me/metrics")
  @RequireCapability("portal:self_report")
  selfReport(
    @Body(new ZodValidationPipe(recordMetricSchema)) dto: RecordMetricDto,
  ): Promise<PatientMetricDto> {
    return this.portal.selfReport(dto);
  }
}
