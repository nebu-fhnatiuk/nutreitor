import { Body, Controller, Get, HttpCode, Post, Put, Query, UseGuards } from "@nestjs/common";
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
  type MessageDto,
  type MessagesQueryDto,
  type NotificationPreferencesDto,
  type SendMessageDto,
  type ThreadDto,
  type PatientMetricDto,
  type PortalMeDto,
  type RecordMetricDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { AdherenceService } from "../patients/adherence.service.js";
import { MessagesService } from "../patients/messages.service.js";
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
    private readonly messages: MessagesService,
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

  /** Conversación con su equipo (polling con `after`). */
  @Get("me/messages")
  @RequireCapability("portal:message")
  myMessages(
    @Query(new ZodValidationPipe(messagesQuerySchema)) q: MessagesQueryDto,
  ): Promise<ThreadDto> {
    return this.messages.mine(q);
  }

  @Post("me/messages")
  @RequireCapability("portal:message")
  sendMessage(@Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto): Promise<MessageDto> {
    return this.messages.sendMine(dto.body);
  }

  @Post("me/messages/read")
  @HttpCode(204)
  @RequireCapability("portal:message")
  readMessages(): Promise<void> {
    return this.messages.markMineRead();
  }

  @Post("me/metrics")
  @RequireCapability("portal:self_report")
  selfReport(
    @Body(new ZodValidationPipe(recordMetricSchema)) dto: RecordMetricDto,
  ): Promise<PatientMetricDto> {
    return this.portal.selfReport(dto);
  }
}
