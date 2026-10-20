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
  addPatientNoteSchema,
  assignCareSchema,
  createPatientSchema,
  updateClinicalVisibilitySchema,
  updatePatientSchema,
  type AddPatientNoteDto,
  type AssignCareDto,
  type CareAssignmentDto,
  type CreatePatientDto,
  type PatientDetailDto,
  type PatientDto,
  type PatientNoteDto,
  type UpdateClinicalVisibilityDto,
  type UpdatePatientDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { CareAssignmentsService } from "./care-assignments.service.js";
import { PatientNotesService } from "./patient-notes.service.js";
import { PatientsService } from "./patients.service.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Endpoints de pacientes, tenant-scoped. JwtAuthGuard setea el contexto RLS;
 * CapabilityGuard autoriza por capacidad. El scoping fino (profesional → sólo
 * asignados) lo aplican los services vía patient-access. Asignar/reasignar es
 * exclusivo del admin (patient:assign).
 */
@Controller("patients")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly assignments: CareAssignmentsService,
    private readonly notes: PatientNotesService,
  ) {}

  @Get()
  @RequireCapability("patient:read")
  list(@Query("search") search?: string, @Query("group") group?: string): Promise<PatientDto[]> {
    // Un id de grupo mal formado no filtra (no rompe el listado).
    return this.patients.list(search, group && UUID_RE.test(group) ? group : undefined);
  }

  @Post()
  @RequireCapability("patient:create")
  create(
    @Body(new ZodValidationPipe(createPatientSchema)) dto: CreatePatientDto,
  ): Promise<PatientDetailDto> {
    return this.patients.create(dto);
  }

  @Get(":id")
  @RequireCapability("patient:read")
  getOne(@Param("id") id: string): Promise<PatientDetailDto> {
    return this.patients.getOne(id);
  }

  @Patch(":id")
  @RequireCapability("patient:update")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePatientSchema)) dto: UpdatePatientDto,
  ): Promise<PatientDetailDto> {
    return this.patients.update(id, dto);
  }

  @Post(":id/archive")
  @RequireCapability("patient:update")
  async archive(@Param("id") id: string): Promise<{ ok: true }> {
    await this.patients.archive(id);
    return { ok: true };
  }

  @Patch(":id/clinical-visibility")
  @RequireCapability("patient:update_clinical_visibility")
  setClinicalVisibility(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateClinicalVisibilitySchema))
    dto: UpdateClinicalVisibilityDto,
  ): Promise<PatientDetailDto> {
    return this.patients.setClinicalVisibility(id, dto);
  }

  // ── Asignaciones (admin) ───────────────────────────────────────────────────

  @Get(":id/assignments")
  @RequireCapability("patient:read")
  listAssignments(@Param("id") id: string): Promise<CareAssignmentDto[]> {
    return this.assignments.listAssignments(id);
  }

  @Post(":id/assignments")
  @RequireCapability("patient:assign")
  assign(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignCareSchema)) dto: AssignCareDto,
  ): Promise<CareAssignmentDto> {
    return this.assignments.assign(id, dto);
  }

  @Post(":id/assignments/:assignmentId/end")
  @RequireCapability("patient:assign")
  async endAssignment(
    @Param("id") id: string,
    @Param("assignmentId") assignmentId: string,
  ): Promise<{ ok: true }> {
    await this.assignments.endAssignment(id, assignmentId);
    return { ok: true };
  }

  // ── Notas clínicas ─────────────────────────────────────────────────────────

  @Get(":id/notes")
  @RequireCapability("patient:read")
  listNotes(@Param("id") id: string): Promise<PatientNoteDto[]> {
    return this.notes.list(id);
  }

  @Post(":id/notes")
  @RequireCapability("patient:add_note")
  addNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addPatientNoteSchema)) dto: AddPatientNoteDto,
  ): Promise<PatientNoteDto> {
    return this.notes.addNote(id, dto);
  }
}
