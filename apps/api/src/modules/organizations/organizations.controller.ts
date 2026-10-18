import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  createOrganizationSchema,
  type CreateOrganizationDto,
  type OrganizationDto,
} from "@nutreitor/shared";

import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { PlatformGuard } from "../onboarding/platform-auth.js";
import { OrganizationsService } from "./organizations.service.js";

/**
 * Endpoints de control-plane: alta directa de una org (ya activa) por un operador
 * de la plataforma. Protegidos por la sesión de plataforma (ADR 0025); el alta
 * autoservicio va por `/signup`.
 */
@Controller("admin/organizations")
@UseGuards(PlatformGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(): Promise<OrganizationDto[]> {
    return this.organizations.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createOrganizationSchema))
    dto: CreateOrganizationDto,
  ): Promise<OrganizationDto> {
    return this.organizations.create(dto);
  }
}
