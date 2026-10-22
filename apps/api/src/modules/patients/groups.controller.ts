import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import {
  addGroupMembersSchema,
  saveGroupAnthropometrySchema,
  saveGroupSchema,
  type AddGroupMembersDto,
  type GroupAnthropometryResultDto,
  type GroupAnthropometrySummaryDto,
  type GroupBoardDto,
  type GroupDetailDto,
  type GroupDto,
  type SaveGroupAnthropometryDto,
  type SaveGroupDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { AnthropometryService } from "./anthropometry.service.js";
import { GroupBoardService } from "./group-board.service.js";
import { GroupsService } from "./groups.service.js";

/**
 * Grupos de deportistas (ADR 0031): plantel, división o turno. Armar y editar es del
 * admin (`group:manage`); ver y medir, de quien atiende (los miembros siguen el
 * scoping de pacientes).
 */
@Controller("groups")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly anthro: AnthropometryService,
    private readonly boardSvc: GroupBoardService,
  ) {}

  /** Pizarra del plantel: semáforo por deportista, ordenada por quién necesita atención. */
  @Get(":id/board")
  @RequireCapability("metric:read")
  board(@Param("id", ParseUUIDPipe) id: string): Promise<GroupBoardDto> {
    return this.boardSvc.board(id);
  }

  @Get()
  @RequireCapability("patient:read")
  list(): Promise<GroupDto[]> {
    return this.groups.list();
  }

  @Post()
  @RequireCapability("group:manage")
  create(@Body(new ZodValidationPipe(saveGroupSchema)) dto: SaveGroupDto): Promise<GroupDetailDto> {
    return this.groups.create(dto);
  }

  @Get(":id")
  @RequireCapability("patient:read")
  get(@Param("id", ParseUUIDPipe) id: string): Promise<GroupDetailDto> {
    return this.groups.get(id);
  }

  @Put(":id")
  @RequireCapability("group:manage")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saveGroupSchema)) dto: SaveGroupDto,
  ): Promise<GroupDetailDto> {
    return this.groups.update(id, dto);
  }

  @Delete(":id")
  @RequireCapability("group:manage")
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.groups.remove(id);
    return { ok: true };
  }

  @Post(":id/members")
  @RequireCapability("group:manage")
  addMembers(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addGroupMembersSchema)) dto: AddGroupMembersDto,
  ): Promise<GroupDetailDto> {
    return this.groups.addMembers(id, dto);
  }

  @Delete(":id/members/:patientId")
  @RequireCapability("group:manage")
  async removeMember(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("patientId", ParseUUIDPipe) patientId: string,
  ): Promise<{ ok: true }> {
    await this.groups.removeMember(id, patientId);
    return { ok: true };
  }

  /** Resumen del plantel: última antropometría de cada deportista. */
  @Get(":id/anthropometry")
  @RequireCapability("metric:read")
  anthropometry(@Param("id", ParseUUIDPipe) id: string): Promise<GroupAnthropometrySummaryDto> {
    return this.anthro.groupSummary(id);
  }

  /** Carga del plantel: una sesión por deportista, todo o nada. */
  @Post(":id/anthropometry")
  @RequireCapability("metric:record")
  recordAnthropometry(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saveGroupAnthropometrySchema)) dto: SaveGroupAnthropometryDto,
  ): Promise<GroupAnthropometryResultDto> {
    return this.anthro.createForGroup(id, dto);
  }
}
