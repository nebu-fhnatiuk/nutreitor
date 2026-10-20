import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  saveEnergySchema,
  type EnergyContextDto,
  type EnergyRequirementDto,
  type SaveEnergyDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { EnergyService } from "./energy.service.js";

/** Requerimiento energético de un paciente (ADR 0032). Append-only. */
@Controller("patients/:patientId/energy")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class EnergyController {
  constructor(private readonly energy: EnergyService) {}

  @Get()
  @RequireCapability("plan:read")
  list(@Param("patientId", ParseUUIDPipe) patientId: string): Promise<EnergyRequirementDto[]> {
    return this.energy.list(patientId);
  }

  @Get("context")
  @RequireCapability("plan:read")
  context(@Param("patientId", ParseUUIDPipe) patientId: string): Promise<EnergyContextDto> {
    return this.energy.context(patientId);
  }

  @Post()
  @RequireCapability("plan:write")
  create(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Body(new ZodValidationPipe(saveEnergySchema)) dto: SaveEnergyDto,
  ): Promise<EnergyRequirementDto> {
    return this.energy.create(patientId, dto);
  }
}
