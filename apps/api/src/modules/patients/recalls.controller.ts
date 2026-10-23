import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { saveRecallSchema, type RecallDto, type SaveRecallDto } from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { RecallsService } from "./recalls.service.js";
import { LogsAccess } from "../../core/audit/access-log.decorator.js";

/** Recordatorios de 24 h de un paciente (ADR 0033). */
@Controller("patients/:patientId/recalls")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class RecallsController {
  constructor(private readonly recalls: RecallsService) {}

  @Get()
  @LogsAccess("recalls", { patientParam: "patientId" })
  @RequireCapability("plan:read")
  list(@Param("patientId", ParseUUIDPipe) patientId: string): Promise<RecallDto[]> {
    return this.recalls.list(patientId);
  }

  @Post()
  @RequireCapability("plan:write")
  create(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Body(new ZodValidationPipe(saveRecallSchema)) dto: SaveRecallDto,
  ): Promise<RecallDto> {
    return this.recalls.create(patientId, dto);
  }

  @Put(":id")
  @RequireCapability("plan:write")
  update(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saveRecallSchema)) dto: SaveRecallDto,
  ): Promise<RecallDto> {
    return this.recalls.update(patientId, id, dto);
  }

  @Delete(":id")
  @RequireCapability("plan:write")
  async remove(@Param("patientId", ParseUUIDPipe) patientId: string, @Param("id", ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.recalls.remove(patientId, id);
    return { ok: true };
  }
}
