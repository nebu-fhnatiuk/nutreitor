import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { adherenceRangeSchema, type AdherenceDto, type AdherenceRangeDto } from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { AdherenceService } from "./adherence.service.js";

/** Adherencia de un paciente (lectura del profesional; el scoping lo hace el service). */
@Controller("patients/:patientId/adherence")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class AdherenceController {
  constructor(private readonly adherence: AdherenceService) {}

  @Get()
  @RequireCapability("metric:read")
  list(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Query(new ZodValidationPipe(adherenceRangeSchema)) range: AdherenceRangeDto,
  ): Promise<AdherenceDto> {
    return this.adherence.forPatient(patientId, range);
  }
}
