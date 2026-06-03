import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  recordMetricSchema,
  type PatientMetricDto,
  type PortalMeDto,
  type RecordMetricDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { PortalService } from "./portal.service.js";

/**
 * Portal del paciente: superficie angosta sobre la PROPIA ficha. El service
 * resuelve "mi paciente" por la sesión; nunca recibe un patientId del cliente.
 */
@Controller("portal")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get("me")
  @RequireCapability("portal:read")
  getMe(): Promise<PortalMeDto> {
    return this.portal.getMe();
  }

  @Post("me/metrics")
  @RequireCapability("portal:self_report")
  selfReport(
    @Body(new ZodValidationPipe(recordMetricSchema)) dto: RecordMetricDto,
  ): Promise<PatientMetricDto> {
    return this.portal.selfReport(dto);
  }
}
