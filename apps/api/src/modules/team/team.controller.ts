import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import type { TeamBoardDto, TeamGroupDto } from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { TeamService } from "./team.service.js";

/**
 * Cuerpo técnico (KAN-109, ADR 0054): sólo lectura de sus planteles. `team:read` es
 * la única capacidad del rol `coach`; ninguna ruta clínica la acepta.
 */
@Controller("team")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get("groups")
  @RequireCapability("team:read")
  groups(): Promise<TeamGroupDto[]> {
    return this.team.groups();
  }

  @Get("groups/:id/board")
  @RequireCapability("team:read")
  board(@Param("id", ParseUUIDPipe) id: string): Promise<TeamBoardDto> {
    return this.team.board(id);
  }
}
