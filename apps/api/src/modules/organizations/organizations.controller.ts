import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  createOrganizationSchema,
  type CreateOrganizationDto,
  type OrganizationDto,
} from "@nutreitor/shared";

import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { OrganizationsService } from "./organizations.service.js";

/**
 * Endpoints de control-plane (administración de plataforma).
 *
 * TODO(seguridad): antes de exponer esto, gatear con authz de PLATFORM-ADMIN
 * (distinta del auth de tenant). Hoy queda sin guard a propósito, para el
 * bootstrap local de tenants. NO desplegar así.
 */
@Controller("admin/organizations")
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
