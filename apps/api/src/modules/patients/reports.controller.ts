import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import {
  createReportSchema,
  updateReportSchema,
  type CreateReportDto,
  type PatientReportDto,
  type UpdateReportDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { ReportsService } from "./reports.service.js";
import { LogsAccess } from "../../core/audit/access-log.decorator.js";

/** Reportes mensuales de un paciente (equipo con acceso a la ficha). */
@Controller("patients/:patientId/reports")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @LogsAccess("reports", { patientParam: "patientId" })
  @RequireCapability("patient:read")
  list(@Param("patientId", new ParseUUIDPipe()) patientId: string): Promise<PatientReportDto[]> {
    return this.reports.list(patientId);
  }

  @Post()
  @RequireCapability("report:write")
  create(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Body(new ZodValidationPipe(createReportSchema)) dto: CreateReportDto,
  ): Promise<PatientReportDto> {
    return this.reports.create(patientId, dto.month);
  }

  @Get(":id")
  @LogsAccess("report", { patientParam: "patientId", targetParam: "id" })
  @RequireCapability("patient:read")
  get(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<PatientReportDto> {
    return this.reports.get(patientId, id);
  }

  @Put(":id")
  @RequireCapability("report:write")
  update(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateReportSchema)) dto: UpdateReportDto,
  ): Promise<PatientReportDto> {
    return this.reports.updateComment(patientId, id, dto.comment);
  }

  @Post(":id/refresh")
  @RequireCapability("report:write")
  refresh(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<PatientReportDto> {
    return this.reports.refresh(patientId, id);
  }

  @Post(":id/publish")
  @RequireCapability("report:write")
  publish(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<PatientReportDto> {
    return this.reports.publish(patientId, id);
  }
}
