import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  savePlanSchema,
  type MealPlanDto,
  type SavePlanDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { MealPlansService } from "./meal-plans.service.js";

/**
 * Planes alimentarios de un paciente (versionados). Ruta anidada; scoping fino
 * (profesional → asignados) en el service vía patient-access.
 */
@Controller("patients/:patientId/plans")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class MealPlansController {
  constructor(private readonly plans: MealPlansService) {}

  @Get()
  @RequireCapability("plan:read")
  list(@Param("patientId") patientId: string): Promise<MealPlanDto[]> {
    return this.plans.list(patientId);
  }

  @Post()
  @RequireCapability("plan:write")
  save(
    @Param("patientId") patientId: string,
    @Body(new ZodValidationPipe(savePlanSchema)) dto: SavePlanDto,
  ): Promise<MealPlanDto> {
    return this.plans.save(patientId, dto);
  }

  @Post("archive")
  @RequireCapability("plan:write")
  async archive(@Param("patientId") patientId: string): Promise<{ ok: true }> {
    await this.plans.archiveActive(patientId);
    return { ok: true };
  }
}
