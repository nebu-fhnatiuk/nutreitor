import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { users } from "@nutreitor/db";
import type { PlatformMe } from "@nutreitor/shared";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import type { CookieOptions, Request, Response } from "express";

import { APP_ENV, type ApiEnv } from "../../core/config/app-config.module.js";
import { AdminDbService } from "../../core/database/admin-db.service.js";

/**
 * Sesión de la consola de plataforma (ADR 0025). Separada de la de las orgs:
 *  - cookie propia (`platform_token`), host-only del dominio raíz: nunca viaja a
 *    un subdominio de tenant, ni la de un tenant llega acá;
 *  - JWT con `aud` propio: un token de tenant no sirve en la consola ni al revés;
 *  - corta y sin refresh: se re-ingresa;
 *  - el guard re-chequea `is_platform_admin` en cada request (revocar = bajar el flag)
 *    y rechaza requests con subdominio (la consola sólo vive en el dominio raíz).
 */
export const PLATFORM_COOKIE = "platform_token";
const AUDIENCE = "nutreitor-platform";
const DUMMY_HASH = bcrypt.hashSync("nutreitor::platform::timing", 10);

interface PlatformPayload {
  sub: string;
  aud: string;
}

/** Usuario de plataforma autenticado, que el guard deja en el request. */
export type PlatformRequest = Request & { platformUser?: PlatformMe };

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly admin: AdminDbService,
    private readonly jwt: JwtService,
    @Inject(APP_ENV) private readonly env: ApiEnv,
  ) {}

  /** Login: mismo 401 genérico y mismo costo de bcrypt en todos los caminos de fallo. */
  async login(email: string, password: string): Promise<{ token: string; me: PlatformMe }> {
    const [u] = await this.admin.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    const ok = await bcrypt.compare(password, u?.hashedPassword ?? DUMMY_HASH);
    if (!u || !ok || !u.isPlatformAdmin) throw new UnauthorizedException("Credenciales inválidas.");
    const token = await this.jwt.signAsync(
      { sub: u.id },
      {
        secret: this.env.JWT_ACCESS_SECRET,
        audience: AUDIENCE,
        expiresIn: this.env.PLATFORM_SESSION_TTL as JwtSignOptions["expiresIn"],
      },
    );
    return { token, me: { id: u.id, email: u.email, fullName: u.fullName } };
  }

  /** Verifica el token y que el usuario siga siendo operador. */
  async verify(token: string): Promise<PlatformMe | null> {
    let payload: PlatformPayload;
    try {
      payload = await this.jwt.verifyAsync<PlatformPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
        audience: AUDIENCE,
      });
    } catch {
      return null;
    }
    const [u] = await this.admin.db
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.id, payload.sub), eq(users.isPlatformAdmin, true)))
      .limit(1);
    return u ?? null;
  }

  setCookie(res: Response, token: string): void {
    res.cookie(PLATFORM_COOKIE, token, { ...this.cookieBase(), maxAge: ttlMs(this.env) });
  }

  clearCookie(res: Response): void {
    res.clearCookie(PLATFORM_COOKIE, this.cookieBase());
  }

  private cookieBase(): CookieOptions {
    // `strict`: la consola no se abre desde links de otros sitios con la sesión puesta.
    return { httpOnly: true, sameSite: "strict", secure: this.env.COOKIE_SECURE, path: "/" };
  }
}

function ttlMs(env: ApiEnv): number {
  const m = /^(\d+)\s*s?$/.exec(env.PLATFORM_SESSION_TTL);
  return (m ? Number(m[1]) : 7200) * 1000;
}

@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly auth: PlatformAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PlatformRequest>();
    if (req.headers["x-tenant-slug"]) {
      throw new ForbiddenException("La consola de plataforma no se usa desde un subdominio.");
    }
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[PLATFORM_COOKIE];
    const me = token ? await this.auth.verify(token) : null;
    if (!me) throw new UnauthorizedException("Sesión de plataforma inválida.");
    req.platformUser = me;
    return true;
  }
}
