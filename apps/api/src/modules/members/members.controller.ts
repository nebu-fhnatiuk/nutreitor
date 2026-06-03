import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  changeRoleSchema,
  updateRosterSchema,
  type ChangeRoleDto,
  type MemberDto,
  type RosterAdminEntry,
  type UpdateRosterDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { MembersService } from "./members.service.js";

@Controller("members")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequireCapability("member:read")
  list(@Query("search") search?: string): Promise<MemberDto[]> {
    return this.members.list(search);
  }

  @Patch(":id/role")
  @RequireCapability("member:change_role")
  async changeRole(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(changeRoleSchema)) dto: ChangeRoleDto,
  ): Promise<{ ok: true }> {
    await this.members.changeRole(id, dto.role);
    return { ok: true };
  }

  @Post(":id/revoke")
  @RequireCapability("member:revoke")
  async revoke(@Param("id") id: string): Promise<{ ok: true }> {
    await this.members.revoke(id);
    return { ok: true };
  }

  @Get("roster")
  @RequireCapability("org:update_public_profile")
  listRoster(): Promise<RosterAdminEntry[]> {
    return this.members.listRoster();
  }

  @Patch(":id/roster")
  @RequireCapability("org:update_public_profile")
  async updateRoster(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRosterSchema)) dto: UpdateRosterDto,
  ): Promise<{ ok: true }> {
    await this.members.updateRoster(id, dto);
    return { ok: true };
  }
}
