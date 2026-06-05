import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  installModuleSchema,
  moduleKeys,
  type InstallModuleDto,
  type ModuleKey,
  type OrgModuleStateDto,
} from "@nutreitor/shared";
import { BadRequestException } from "@nestjs/common";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { OrgModulesService } from "./org-modules.service.js";

/**
 * Complementos instalables de la org actual (admin). Instalar = aceptar términos +
 * plan; desinstalar es soft (conserva datos). El acceso a la feature lo gatea el
 * ModuleGuard en cada endpoint que la usa. Ver ADR 0016.
 */
@Controller("organizations/current/modules")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class OrgModulesController {
  constructor(private readonly modules: OrgModulesService) {}

  @Get()
  @RequireCapability("org:manage_modules")
  list(): Promise<OrgModuleStateDto[]> {
    return this.modules.list();
  }

  @Post(":module/install")
  @RequireCapability("org:manage_modules")
  install(
    @Param("module") module: string,
    @Body(new ZodValidationPipe(installModuleSchema)) dto: InstallModuleDto,
  ): Promise<OrgModuleStateDto[]> {
    return this.modules.install(this.parseModule(module), dto);
  }

  @Post(":module/uninstall")
  @RequireCapability("org:manage_modules")
  uninstall(@Param("module") module: string): Promise<OrgModuleStateDto[]> {
    return this.modules.uninstall(this.parseModule(module));
  }

  private parseModule(module: string): ModuleKey {
    if (!(moduleKeys as readonly string[]).includes(module)) {
      throw new BadRequestException("Complemento desconocido.");
    }
    return module as ModuleKey;
  }
}
