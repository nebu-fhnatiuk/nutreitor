import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import {
  saveGroupSweatTestSchema,
  saveSweatTestSchema,
  type GroupSweatRowDto,
  type SaveGroupSweatTestDto,
  type SaveSweatTestDto,
  type SweatTestDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { HydrationService } from "./hydration.service.js";

/** Pruebas de sudoración de un deportista (ADR 0036). */
@Controller("patients/:patientId/sweat-tests")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class HydrationController {
  constructor(private readonly hydration: HydrationService) {}

  @Get()
  @RequireCapability("metric:read")
  list(@Param("patientId", ParseUUIDPipe) patientId: string): Promise<SweatTestDto[]> {
    return this.hydration.list(patientId);
  }

  @Post()
  @RequireCapability("metric:record")
  create(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Body(new ZodValidationPipe(saveSweatTestSchema)) dto: SaveSweatTestDto,
  ): Promise<SweatTestDto> {
    return this.hydration.create(patientId, dto);
  }

  @Put(":id")
  @RequireCapability("metric:record")
  update(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saveSweatTestSchema)) dto: SaveSweatTestDto,
  ): Promise<SweatTestDto> {
    return this.hydration.update(patientId, id, dto);
  }

  @Delete(":id")
  @RequireCapability("metric:record")
  async remove(@Param("patientId", ParseUUIDPipe) patientId: string, @Param("id", ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.hydration.remove(patientId, id);
    return { ok: true };
  }
}

/** Hidratación del plantel (ADR 0036): resumen y carga en lote. */
@Controller("groups/:groupId/sweat-tests")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class GroupHydrationController {
  constructor(private readonly hydration: HydrationService) {}

  @Get()
  @RequireCapability("metric:read")
  summary(@Param("groupId", ParseUUIDPipe) groupId: string): Promise<GroupSweatRowDto[]> {
    return this.hydration.groupSummary(groupId);
  }

  @Post()
  @RequireCapability("metric:record")
  create(
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body(new ZodValidationPipe(saveGroupSweatTestSchema)) dto: SaveGroupSweatTestDto,
  ): Promise<{ created: number }> {
    return this.hydration.createForGroup(groupId, dto);
  }
}
