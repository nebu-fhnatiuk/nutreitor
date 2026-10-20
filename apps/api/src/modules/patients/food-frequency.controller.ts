import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { saveFoodFrequencySchema, type FoodFrequencyDto, type SaveFoodFrequencyDto } from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { FoodFrequencyService } from "./food-frequency.service.js";

/** Cuestionarios de frecuencia de consumo de un paciente (ADR 0034). */
@Controller("patients/:patientId/food-frequency")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class FoodFrequencyController {
  constructor(private readonly ffq: FoodFrequencyService) {}

  @Get()
  @RequireCapability("plan:read")
  list(@Param("patientId", ParseUUIDPipe) patientId: string): Promise<FoodFrequencyDto[]> {
    return this.ffq.list(patientId);
  }

  @Post()
  @RequireCapability("plan:write")
  create(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Body(new ZodValidationPipe(saveFoodFrequencySchema)) dto: SaveFoodFrequencyDto,
  ): Promise<FoodFrequencyDto> {
    return this.ffq.create(patientId, dto);
  }

  @Put(":id")
  @RequireCapability("plan:write")
  update(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saveFoodFrequencySchema)) dto: SaveFoodFrequencyDto,
  ): Promise<FoodFrequencyDto> {
    return this.ffq.update(patientId, id, dto);
  }

  @Delete(":id")
  @RequireCapability("plan:write")
  async remove(@Param("patientId", ParseUUIDPipe) patientId: string, @Param("id", ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.ffq.remove(patientId, id);
    return { ok: true };
  }
}
