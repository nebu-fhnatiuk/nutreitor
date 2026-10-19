import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { efficiencyQuerySchema, type EfficiencyDto, type EfficiencyQueryDto } from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { EfficiencyService } from "./efficiency.service.js";

/** Métricas de eficiencia: la admin ve al equipo; el profesional, lo suyo (lo decide el service). */
@Controller("efficiency")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class EfficiencyController {
  constructor(private readonly efficiency: EfficiencyService) {}

  @Get()
  @RequireCapability("patient:read")
  get(@Query(new ZodValidationPipe(efficiencyQuerySchema)) q: EfficiencyQueryDto): Promise<EfficiencyDto> {
    return this.efficiency.forSession(q.days, q.mine);
  }
}
