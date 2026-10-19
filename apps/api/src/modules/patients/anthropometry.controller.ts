import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import {
  saveAnthropometrySchema,
  type AnthropometrySessionDto,
  type SaveAnthropometryDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { AnthropometryService } from "./anthropometry.service.js";

/** Sesiones de antropometría ISAK de un paciente (ADR 0030). */
@Controller("patients/:patientId/anthropometry")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class AnthropometryController {
  constructor(private readonly anthro: AnthropometryService) {}

  @Get()
  @RequireCapability("metric:read")
  list(@Param("patientId", ParseUUIDPipe) patientId: string): Promise<AnthropometrySessionDto[]> {
    return this.anthro.list(patientId);
  }

  @Post()
  @RequireCapability("metric:record")
  create(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Body(new ZodValidationPipe(saveAnthropometrySchema)) dto: SaveAnthropometryDto,
  ): Promise<AnthropometrySessionDto> {
    return this.anthro.create(patientId, dto);
  }

  @Put(":id")
  @RequireCapability("metric:record")
  update(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saveAnthropometrySchema)) dto: SaveAnthropometryDto,
  ): Promise<AnthropometrySessionDto> {
    return this.anthro.update(patientId, id, dto);
  }

  @Delete(":id")
  @RequireCapability("metric:record")
  async remove(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.anthro.remove(patientId, id);
    return { ok: true };
  }
}
