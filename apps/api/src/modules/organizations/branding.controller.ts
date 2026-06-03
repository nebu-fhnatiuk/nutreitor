import { Body, Controller, Patch, UseGuards } from "@nestjs/common";
import {
  updateBrandingSchema,
  type BrandingDto,
  type UpdateBrandingDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { OrganizationsService } from "./organizations.service.js";

/** Branding del tenant actual (editable por el admin de la org). */
@Controller("organizations/current/branding")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class BrandingController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Patch()
  @RequireCapability("org:update_branding")
  update(
    @Body(new ZodValidationPipe(updateBrandingSchema)) dto: UpdateBrandingDto,
  ): Promise<BrandingDto> {
    return this.organizations.updateBranding(dto);
  }
}
