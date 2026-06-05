import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { orgModules } from "@nutreitor/db";
import type { ModuleKey } from "@nutreitor/shared";
import { and, eq } from "drizzle-orm";

import { TenantDbService } from "../database/tenant-db.service.js";
import { MODULE_KEY } from "./require-module.decorator.js";

/**
 * Gating por MÓDULO instalado en la org (entitlement a nivel tenant). Debe ir
 * DESPUÉS de JwtAuthGuard (contexto de tenant en el ALS) y de CapabilityGuard. Si el
 * handler declara @RequireModule y la org no tiene ese módulo ACTIVO, corta (403).
 * Defensa en el servidor: no alcanza con ocultar la feature en la UI. Ver ADR 0016.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantDb: TenantDbService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ModuleKey | undefined>(
      MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const active = await this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .select({ id: orgModules.id })
        .from(orgModules)
        .where(and(eq(orgModules.module, required), eq(orgModules.status, "active")))
        .limit(1);
      return Boolean(row);
    });
    if (!active) {
      throw new ForbiddenException(
        "Esta función requiere instalar el complemento desde la organización.",
      );
    }
    return true;
  }
}
