import {
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";

import { tenantStorage } from "../../tenant/tenant-context.store.js";
import type { AccessPayload } from "../auth.service.js";
import { AuthService } from "../auth.service.js";
import { TenantResolverService } from "../tenant-resolver.service.js";

/**
 * Guard de acceso. Sobre la validación de firma de passport-jwt agrega:
 *  (b) resuelve el slug del subdominio (header `x-tenant-slug` que inyecta el web),
 *  (c) verifica que la org del slug coincida con la del JWT (un token de A no sirve
 *      en el subdominio de B),
 *  (d) verifica que el membership user↔org siga existiendo,
 *  (e) setea el TenantContext en el ALS → RLS por `app.current_tenant_id`.
 *
 * El tenant_id que llega a la DB sale SIEMPRE de acá (JWT + lookup), nunca de un
 * parámetro de request.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(
    private readonly tenantResolver: TenantResolverService,
    private readonly auth: AuthService,
  ) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const req = context.switchToHttp().getRequest<Request & { user: AccessPayload }>();
    const payload = req.user;

    const slug = (req.headers["x-tenant-slug"] as string | undefined)?.trim();
    if (!slug) throw new UnauthorizedException("Tenant no resuelto.");

    const org = await this.tenantResolver.bySlug(slug);
    if (!org || org.id !== payload.org) {
      throw new UnauthorizedException("La sesión no corresponde a esta organización.");
    }

    const role = await this.auth.findMembershipRole(payload.sub, org.id);
    if (!role || role !== payload.role) {
      throw new UnauthorizedException("Membership inexistente.");
    }

    const store = tenantStorage.getStore();
    if (!store) throw new UnauthorizedException("Scope de tenant no inicializado.");
    store.context = { tenantId: org.id, orgId: org.id, region: org.region };
    store.org = org;
    store.user = { id: payload.sub, role };
    return true;
  }
}
