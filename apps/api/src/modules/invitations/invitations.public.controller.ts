import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  acceptInvitationSchema,
  type AcceptInvitationDto,
  type InvitationPreview,
  type LoginResponse,
} from "@nutreitor/shared";
import type { Request, Response } from "express";

import { setSessionCookies } from "../../core/auth/auth-cookies.js";
import { APP_ENV, type ApiEnv } from "../../core/config/app-config.module.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { RateLimit } from "../../core/rate-limit/rate-limit.decorator.js";
import { INVITE_ACCEPT, INVITE_LOOKUP } from "../../core/rate-limit/rate-limit.rules.js";
import { InvitationsService } from "./invitations.service.js";

/**
 * Endpoints públicos de invitación (pre-auth). El token resuelve la org, así que
 * no requieren JWT ni subdominio (igual pasan por el secreto de borde via proxy).
 */
@Controller("invitations")
export class InvitationsPublicController {
  constructor(
    private readonly invitations: InvitationsService,
    @Inject(APP_ENV) private readonly env: ApiEnv,
  ) {}

  @Get("lookup")
  @RateLimit(INVITE_LOOKUP)
  lookup(@Query("token") token?: string): Promise<InvitationPreview> {
    if (!token) throw new BadRequestException("Falta el token.");
    return this.invitations.lookup(token);
  }

  /** Acepta la invitación y deja al invitado logueado (auto-login). */
  @Post("accept")
  @RateLimit(INVITE_ACCEPT)
  async accept(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) dto: AcceptInvitationDto,
  ): Promise<LoginResponse> {
    const session = await this.invitations.accept(dto, req.headers["user-agent"]);
    setSessionCookies(res, session, this.env);
    return session.result;
  }
}
