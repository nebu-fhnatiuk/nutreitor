import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  recordMetricSchema,
  updateMetricSchema,
  type PatientMetricDto,
  type RecordMetricDto,
  type UpdateMetricDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { MetricsService } from "./metrics.service.js";

/**
 * Mediciones (serie temporal) de un paciente. Ruta anidada bajo el paciente; el
 * scoping fino (profesional → asignados) lo aplica el service vía patient-access.
 */
@Controller("patients/:patientId/metrics")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @RequireCapability("metric:read")
  list(@Param("patientId") patientId: string): Promise<PatientMetricDto[]> {
    return this.metrics.list(patientId);
  }

  @Post()
  @RequireCapability("metric:record")
  record(
    @Param("patientId") patientId: string,
    @Body(new ZodValidationPipe(recordMetricSchema)) dto: RecordMetricDto,
  ): Promise<PatientMetricDto> {
    return this.metrics.record(patientId, dto);
  }

  @Patch(":metricId")
  @RequireCapability("metric:record")
  update(
    @Param("patientId") patientId: string,
    @Param("metricId") metricId: string,
    @Body(new ZodValidationPipe(updateMetricSchema)) dto: UpdateMetricDto,
  ): Promise<PatientMetricDto> {
    return this.metrics.update(patientId, metricId, dto);
  }

  @Delete(":metricId")
  @RequireCapability("metric:record")
  async remove(
    @Param("patientId") patientId: string,
    @Param("metricId") metricId: string,
  ): Promise<{ ok: true }> {
    await this.metrics.remove(patientId, metricId);
    return { ok: true };
  }
}
