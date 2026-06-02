import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { MembershipRole } from "@nutreitor/shared";

import { getAuth } from "../../tenant/tenant-context.store.js";
import { ROLES_KEY } from "../roles.decorator.js";

/**
 * Autorización por rol. Debe ir DESPUÉS de JwtAuthGuard (que llena el ALS con el
 * rol de la sesión). Sin @Roles en el handler, no restringe.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<MembershipRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = getAuth();
    if (!required.includes(user.role)) {
      throw new ForbiddenException("Rol insuficiente.");
    }
    return true;
  }
}
