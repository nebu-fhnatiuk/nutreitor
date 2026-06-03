import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  createInvitationSchema,
  type CreateInvitationDto,
  type InvitationDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { InvitationsService } from "./invitations.service.js";

/** Endpoints de invitación para admins del tenant (capability-gated, auditados). */
@Controller("invitations")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class InvitationsAdminController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @RequireCapability("member:invite")
  create(
    @Body(new ZodValidationPipe(createInvitationSchema)) dto: CreateInvitationDto,
  ): Promise<InvitationDto> {
    return this.invitations.create(dto);
  }

  @Get()
  @RequireCapability("member:read")
  list(): Promise<InvitationDto[]> {
    return this.invitations.listPending();
  }

  @Post(":id/resend")
  @RequireCapability("member:invite")
  async resend(@Param("id") id: string): Promise<{ ok: true }> {
    await this.invitations.resend(id);
    return { ok: true };
  }

  @Post(":id/revoke")
  @RequireCapability("member:revoke")
  async revoke(@Param("id") id: string): Promise<{ ok: true }> {
    await this.invitations.revoke(id);
    return { ok: true };
  }
}
