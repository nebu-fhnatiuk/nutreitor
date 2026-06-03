import { Body, Controller, Patch, UseGuards } from "@nestjs/common";
import {
  updateOrgPublicProfileSchema,
  type UpdateOrgPublicProfileDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { OrganizationsService } from "./organizations.service.js";

/**
 * Página pública de la org (headline/description de la capa de captación). La cura
 * el admin del propio tenant (org:update_public_profile). La lectura pública va por
 * el módulo `public/` (bajo RLS); acá sólo la edición.
 */
@Controller("organizations/current/public-profile")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class OrgPublicProfileController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Patch()
  @RequireCapability("org:update_public_profile")
  update(
    @Body(new ZodValidationPipe(updateOrgPublicProfileSchema))
    dto: UpdateOrgPublicProfileDto,
  ): Promise<{ publicHeadline: string | null; publicDescription: string | null }> {
    return this.organizations.updatePublicProfile(dto);
  }
}
