import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import {
  updateProfessionalProfileSchema,
  type OwnProfessionalProfile,
  type UpdateProfessionalProfileDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { ProfessionalProfileService } from "./professional-profile.service.js";

/**
 * Perfil propio del profesional (vidriera por membership). Gateado por
 * professional:update_own_profile; el membership sale de la sesión, no del path.
 */
@Controller("professional/me/profile")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class ProfessionalProfileController {
  constructor(private readonly profile: ProfessionalProfileService) {}

  @Get()
  @RequireCapability("professional:update_own_profile")
  getMine(): Promise<OwnProfessionalProfile> {
    return this.profile.getMine();
  }

  @Patch()
  @RequireCapability("professional:update_own_profile")
  updateMine(
    @Body(new ZodValidationPipe(updateProfessionalProfileSchema))
    dto: UpdateProfessionalProfileDto,
  ): Promise<OwnProfessionalProfile> {
    return this.profile.updateMine(dto);
  }
}
