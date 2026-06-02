import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  loginSchema,
  type AuthOrg,
  type LoginDto,
  type MeResponse,
} from "@nutreitor/shared";
import type { CookieOptions, Request, Response } from "express";

import { APP_ENV, type ApiEnv } from "../config/app-config.module.js";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe.js";
import { getAuth } from "../tenant/tenant-context.store.js";
import { AuthService, type IssuedSession } from "./auth.service.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { TenantResolverService } from "./tenant-resolver.service.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tenantResolver: TenantResolverService,
    @Inject(APP_ENV) private readonly env: ApiEnv,
  ) {}

  /** Branding público de la org por slug (para el login brandeado). Sin auth. */
  @Get("tenant/:slug")
  async tenant(@Param("slug") slug: string): Promise<Omit<AuthOrg, "id">> {
    const org = await this.tenantResolver.bySlug(slug);
    if (!org) throw new NotFoundException("Organización no encontrada.");
    return { name: org.name, slug: org.slug, region: org.region };
  }

  /** Login dentro del tenant del subdominio (slug en header x-tenant-slug). */
  @Post("login")
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
  ): Promise<MeResponse & { redirect: string }> {
    const slug = this.slugFrom(req);
    if (!slug) throw new BadRequestException("Tenant no resuelto (subdominio).");
    const session = await this.auth.login(
      slug,
      dto.email,
      dto.password,
      req.headers["user-agent"],
    );
    this.setCookies(res, session);
    return session.result;
  }

  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse & { redirect: string }> {
    const raw = this.cookie(req, "refresh_token");
    if (!raw) throw new UnauthorizedException("Sin refresh token.");
    const session = await this.auth.refresh(raw, req.headers["user-agent"]);
    this.setCookies(res, session);
    return session.result;
  }

  @Post("logout")
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.auth.logout(this.cookie(req, "refresh_token"));
    res.clearCookie("access_token", { path: "/" });
    res.clearCookie("refresh_token", { path: "/" });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(): Promise<MeResponse> {
    const { user, org } = getAuth();
    return this.auth.buildMe(user.id, org, user.role);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private slugFrom(req: Request): string | undefined {
    const v = req.headers["x-tenant-slug"];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  }

  private cookie(req: Request, name: string): string | undefined {
    return (req as Request & { cookies?: Record<string, string> }).cookies?.[name];
  }

  private setCookies(res: Response, session: IssuedSession): void {
    const base: CookieOptions = {
      httpOnly: true,
      sameSite: "lax",
      secure: this.env.COOKIE_SECURE,
      path: "/",
    };
    res.cookie("access_token", session.accessToken, {
      ...base,
      maxAge: this.accessTtlSeconds() * 1000,
    });
    res.cookie("refresh_token", session.refreshToken, {
      ...base,
      maxAge: this.env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
  }

  private accessTtlSeconds(): number {
    const m = /^(\d+)\s*s?$/.exec(this.env.ACCESS_TTL);
    return m ? Number(m[1]) : 900;
  }
}
