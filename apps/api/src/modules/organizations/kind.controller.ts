import { Body, Controller, Put, UseGuards } from "@nestjs/common";
import { changeOrgKindSchema, type ChangeOrgKindDto, type OrgKind } from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { OrganizationsService } from "./organizations.service.js";

/** Tipo de cuenta: independiente ⇄ equipo (admin de la org, ADR 0026). */
@Controller("organizations/current/kind")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class OrgKindController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Put()
  @RequireCapability("org:manage_modules")
  update(
    @Body(new ZodValidationPipe(changeOrgKindSchema)) dto: ChangeOrgKindDto,
  ): Promise<{ kind: OrgKind }> {
    return this.organizations.changeKind(dto);
  }
}
