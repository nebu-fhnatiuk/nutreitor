import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { savePlanTemplateSchema, type PlanTemplateDto, type SavePlanTemplateDto } from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { PlanTemplatesService } from "./plan-templates.service.js";

/** Plantillas de planes del consultorio (Fase 4.2). */
@Controller("plan-templates")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class PlanTemplatesController {
  constructor(private readonly templates: PlanTemplatesService) {}

  @Get()
  @RequireCapability("plan:read")
  list(): Promise<PlanTemplateDto[]> {
    return this.templates.list();
  }

  @Post()
  @RequireCapability("plan:write")
  create(@Body(new ZodValidationPipe(savePlanTemplateSchema)) dto: SavePlanTemplateDto): Promise<PlanTemplateDto> {
    return this.templates.create(dto);
  }

  @Post(":id/archive")
  @RequireCapability("plan:write")
  async archive(@Param("id", new ParseUUIDPipe()) id: string): Promise<{ ok: true }> {
    await this.templates.archive(id);
    return { ok: true };
  }
}
