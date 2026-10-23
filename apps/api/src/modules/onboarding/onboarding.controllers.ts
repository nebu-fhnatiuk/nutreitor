import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  createLeadSchema,
  leadStatuses,
  updateLeadStatusSchema,
  type CreateLeadDto,
  type LeadStatus,
  type SalesLeadDto,
  type UpdateLeadStatusDto,
  confirmOrgSignupSchema,
  licenseDecisionSchema,
  orgDecisionSchema,
  orgSignupSchema,
  orgStatuses,
  platformLoginSchema,
  type ConfirmOrgSignupDto,
  type LicenseDecisionDto,
  type OnboardingStatus,
  type OrgDecisionDto,
  type OrgSignupCompleted,
  type OrgSignupDto,
  type OrgSignupPreview,
  type OrgSignupStarted,
  type OrgStatus,
  type PlatformLicenseEntry,
  type PlatformLoginDto,
  type PlatformMe,
  type PlatformOrgEntry,
  type SlugAvailability,
} from "@nutreitor/shared";
import type { Response } from "express";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { RateLimit } from "../../core/rate-limit/rate-limit.decorator.js";
import {
  LEAD_BY_EMAIL,
  LEAD_BY_IP,
  LOGIN_BY_EMAIL,
  LOGIN_BY_IP,
  SIGNUP_BY_EMAIL,
  SIGNUP_BY_IP,
  SIGNUP_CONFIRM,
  SIGNUP_LOOKUP,
  SIGNUP_SLUG,
} from "../../core/rate-limit/rate-limit.rules.js";
import { OnboardingStatusService } from "./onboarding-status.service.js";
import {
  PlatformAuthService,
  PlatformGuard,
  type PlatformRequest,
} from "./platform-auth.js";
import { LeadsService } from "./leads.service.js";
import { PlatformService } from "./platform.service.js";
import { SignupService } from "./signup.service.js";

/** Alta autoservicio (dominio raíz, sin sesión). */
@Controller("signup")
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  @Get("slug")
  @RateLimit(SIGNUP_SLUG)
  slug(@Query("slug") slug = ""): Promise<SlugAvailability> {
    return this.signup.slugAvailability(slug);
  }

  @Post()
  @HttpCode(202)
  @RateLimit(SIGNUP_BY_IP, SIGNUP_BY_EMAIL)
  async start(
    @Body(new ZodValidationPipe(orgSignupSchema)) dto: OrgSignupDto,
  ): Promise<OrgSignupStarted> {
    await this.signup.start(dto);
    return { ok: true };
  }

  @Get("lookup")
  @RateLimit(SIGNUP_LOOKUP)
  lookup(@Query("token") token?: string): Promise<OrgSignupPreview> {
    return this.signup.lookup(token);
  }

  @Post("confirm")
  @RateLimit(SIGNUP_CONFIRM)
  confirm(
    @Body(new ZodValidationPipe(confirmOrgSignupSchema)) dto: ConfirmOrgSignupDto,
  ): Promise<OrgSignupCompleted> {
    return this.signup.confirm(dto);
  }
}

/** Sesión de la consola de plataforma. */
@Controller("platform/auth")
export class PlatformAuthController {
  constructor(private readonly auth: PlatformAuthService) {}

  @Post("login")
  @RateLimit(LOGIN_BY_IP, LOGIN_BY_EMAIL)
  async login(
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(platformLoginSchema)) dto: PlatformLoginDto,
  ): Promise<PlatformMe> {
    const { token, me } = await this.auth.login(dto.email, dto.password);
    this.auth.setCookie(res, token);
    return me;
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    this.auth.clearCookie(res);
    return { ok: true };
  }

  @Get("me")
  @UseGuards(PlatformGuard)
  me(@Req() req: PlatformRequest): PlatformMe {
    return req.platformUser!;
  }
}

/** Consola: aprobar orgs y revisar matrículas. */
@Controller("platform")
@UseGuards(PlatformGuard)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get("orgs")
  orgs(@Query("status") status?: string): Promise<PlatformOrgEntry[]> {
    const s = (orgStatuses as readonly string[]).includes(status ?? "")
      ? (status as OrgStatus)
      : undefined;
    return this.platform.listOrgs(s);
  }

  @Post("orgs/:id/decision")
  decideOrg(
    @Req() req: PlatformRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(orgDecisionSchema)) dto: OrgDecisionDto,
  ): Promise<PlatformOrgEntry> {
    return this.platform.decideOrg(id, dto, req.platformUser!);
  }

  @Get("licenses")
  licenses(): Promise<PlatformLicenseEntry[]> {
    return this.platform.pendingLicenses();
  }

  @Post("licenses/:profileId/decision")
  decideLicense(
    @Req() req: PlatformRequest,
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Body(new ZodValidationPipe(licenseDecisionSchema)) dto: LicenseDecisionDto,
  ): Promise<PlatformLicenseEntry> {
    return this.platform.decideLicense(profileId, dto, req.platformUser!);
  }
}

/**
 * Consulta comercial desde la landing (KAN-80). Pública y sin sesión. Responde
 * igual aunque el campo trampa la descarte.
 */
@Controller("public/leads")
export class PublicLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  @HttpCode(202)
  @RateLimit(LEAD_BY_IP, LEAD_BY_EMAIL)
  async create(@Body(new ZodValidationPipe(createLeadSchema)) dto: CreateLeadDto): Promise<{ ok: true }> {
    await this.leads.create(dto);
    return { ok: true };
  }
}

/** Consola: las consultas comerciales y su seguimiento. */
@Controller("platform/leads")
@UseGuards(PlatformGuard)
export class PlatformLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(@Query("status") status?: string): Promise<SalesLeadDto[]> {
    const s = (leadStatuses as readonly string[]).includes(status ?? "") ? (status as LeadStatus) : undefined;
    return this.leads.list(s);
  }

  @Post(":id/status")
  setStatus(
    @Req() req: PlatformRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLeadStatusSchema)) dto: UpdateLeadStatusDto,
  ): Promise<SalesLeadDto> {
    return this.leads.setStatus(id, dto.status, req.platformUser!);
  }
}

/** Primeros pasos del workspace (admin de la org). */
@Controller("organizations/current/onboarding")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class OnboardingStatusController {
  constructor(private readonly status: OnboardingStatusService) {}

  @Get()
  @RequireCapability("org:manage_modules")
  get(): Promise<OnboardingStatus> {
    return this.status.get();
  }
}
