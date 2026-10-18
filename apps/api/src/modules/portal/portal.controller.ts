import { Body, Controller, Get, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  adherenceRangeSchema,
  checkinSchema,
  logMealSchema,
  recordMetricSchema,
  type AdherenceDto,
  type AdherenceRangeDto,
  type CheckinDto,
  type CheckinRecordDto,
  type LogMealDto,
  type MealLogDto,
  type PatientMetricDto,
  type PortalMeDto,
  type RecordMetricDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { AdherenceService } from "../patients/adherence.service.js";
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

  @Post("me/metrics")
  @RequireCapability("portal:self_report")
  selfReport(
    @Body(new ZodValidationPipe(recordMetricSchema)) dto: RecordMetricDto,
  ): Promise<PatientMetricDto> {
    return this.portal.selfReport(dto);
  }
}
