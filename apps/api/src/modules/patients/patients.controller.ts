import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  createPatientSchema,
  type CreatePatientDto,
  type PatientDto,
} from "@nutreitor/shared";

import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { PatientsService } from "./patients.service.js";

/**
 * Endpoints de pacientes, tenant-scoped. JwtAuthGuard valida la sesión y setea el
 * contexto de RLS; CapabilityGuard autoriza por capacidad (no por rol crudo). RLS
 * acota a las filas del tenant.
 */
@Controller("patients")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @RequireCapability("patient:read")
  list(): Promise<PatientDto[]> {
    return this.patients.list();
  }

  @Post()
  @RequireCapability("patient:create")
  create(
    @Body(new ZodValidationPipe(createPatientSchema)) dto: CreatePatientDto,
  ): Promise<PatientDto> {
    return this.patients.create(dto);
  }
}
