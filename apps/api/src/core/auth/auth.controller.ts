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
  type BrandingDto,
  type LoginDto,
  type LoginResponse,
  type MeResponse,
} from "@nutreitor/shared";
import type { Request, Response } from "express";

import { APP_ENV, type ApiEnv } from "../config/app-config.module.js";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe.js";
import { getAuth } from "../tenant/tenant-context.store.js";
import { clearSessionCookies, setSessionCookies } from "./auth-cookies.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { RateLimit } from "../rate-limit/rate-limit.decorator.js";
import { LOGIN_BY_EMAIL, LOGIN_BY_IP } from "../rate-limit/rate-limit.rules.js";
import { TenantResolverService } from "./tenant-resolver.service.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tenantResolver: TenantResolverService,
    @Inject(APP_ENV) private readonly env: ApiEnv,
  ) {}

  /** Branding público de la org por slug (login brandeado + tema del workspace). */
  @Get("tenant/:slug")
  async tenant(@Param("slug") slug: string): Promise<BrandingDto> {
    const branding = await this.tenantResolver.brandingBySlug(slug);
    if (!branding) throw new NotFoundException("Organización no encontrada.");
    return branding;
  }

  /** Login dentro del tenant del subdominio (slug en header x-tenant-slug). */
  @Post("login")
  @RateLimit(LOGIN_BY_IP, LOGIN_BY_EMAIL)
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
  ): Promise<LoginResponse> {
    const slug = this.slugFrom(req);
    if (!slug) throw new BadRequestException("Tenant no resuelto (subdominio).");
    const session = await this.auth.login(
      slug,
      dto.email,
      dto.password,
      req.headers["user-agent"],
    );
    setSessionCookies(res, session, this.env);
    return session.result;
  }

  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const raw = this.cookie(req, "refresh_token");
    if (!raw) throw new UnauthorizedException("Sin refresh token.");
    const session = await this.auth.refresh(raw, req.headers["user-agent"]);
    setSessionCookies(res, session, this.env);
    return session.result;
  }

  @Post("logout")
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.auth.logout(this.cookie(req, "refresh_token"));
    clearSessionCookies(res);
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
}
