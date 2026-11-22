import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import {
  addGroupCoachSchema,
  type AddGroupCoachDto,
  type GroupCoachDto,
  addGroupMembersSchema,
  applyGroupPlanSchema,
  assignGroupProfessionalSchema,
  type ApplyGroupPlanDto,
  type ApplyGroupPlanResultDto,
  type AssignGroupProfessionalDto,
  type AssignGroupProfessionalResultDto,
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
import { GroupActionsService } from "./group-actions.service.js";
import { GroupBoardService } from "./group-board.service.js";
import { GroupsService } from "./groups.service.js";
import { LogsAccess } from "../../core/audit/access-log.decorator.js";

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
    private readonly actions: GroupActionsService,
  ) {}

  /** KAN-32: asignar un profesional a todo el grupo (todo o nada). */
  @Post(":id/assign")
  @RequireCapability("patient:assign")
  assignProfessional(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignGroupProfessionalSchema)) dto: AssignGroupProfessionalDto,
  ): Promise<AssignGroupProfessionalResultDto> {
    return this.actions.assignProfessional(id, dto);
  }

  /** KAN-33: aplicar una plantilla a todo el grupo (un plan propio por deportista). */
  @Post(":id/plan")
  @RequireCapability("plan:write")
  applyPlan(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(applyGroupPlanSchema)) dto: ApplyGroupPlanDto,
  ): Promise<ApplyGroupPlanResultDto> {
    return this.actions.applyPlan(id, dto);
  }

  /** Pizarra del plantel: semáforo por deportista, ordenada por quién necesita atención. */
  @Get(":id/board")
  @LogsAccess("group_board", { targetParam: "id" })
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

  /** Cuerpo técnico del plantel (KAN-109): sólo lo arma el admin. */
  @Get(":id/coaches")
  @RequireCapability("group:manage")
  coaches(@Param("id", ParseUUIDPipe) id: string): Promise<GroupCoachDto[]> {
    return this.groups.listCoaches(id);
  }

  @Post(":id/coaches")
  @RequireCapability("group:manage")
  async addCoach(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addGroupCoachSchema)) dto: AddGroupCoachDto,
  ): Promise<GroupCoachDto[]> {
    await this.groups.addCoach(id, dto);
    return this.groups.listCoaches(id);
  }

  @Delete(":id/coaches/:membershipId")
  @RequireCapability("group:manage")
  async removeCoach(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
  ): Promise<{ ok: true }> {
    await this.groups.removeCoach(id, membershipId);
    return { ok: true };
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
  @LogsAccess("anthropometry", { targetParam: "id" })
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
