import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasCapability, type Capability } from "@nutreitor/shared";

import { getAuth } from "../tenant/tenant-context.store.js";
import { CAPABILITIES_KEY } from "./require-capability.decorator.js";

/**
 * Autorización por capacidad. Debe ir DESPUÉS de JwtAuthGuard (que resuelve el
 * rol del membership en el tenant y lo deja en el ALS). Exige TODAS las
 * capacidades declaradas con @RequireCapability. Sin decorador, no restringe.
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Capability[]>(
      CAPABILITIES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const { user } = getAuth();
    const ok = required.every((cap) => hasCapability(user.role, cap));
    if (!ok) throw new ForbiddenException("Capacidad insuficiente.");
    return true;
  }
}
