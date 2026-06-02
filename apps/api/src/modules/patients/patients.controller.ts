import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  createPatientSchema,
  type CreatePatientDto,
  type PatientDto,
} from "@nutreitor/shared";

import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../../core/auth/guards/roles.guard.js";
import { Roles } from "../../core/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { PatientsService } from "./patients.service.js";

/**
 * Endpoints de pacientes, tenant-scoped. Protegidos por la sesión real:
 * JwtAuthGuard valida el JWT, verifica el membership y setea el contexto de RLS;
 * RolesGuard restringe a admin/professional. RLS acota a las filas del tenant.
 */
@Controller("patients")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "professional")
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  list(): Promise<PatientDto[]> {
    return this.patients.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createPatientSchema)) dto: CreatePatientDto,
  ): Promise<PatientDto> {
    return this.patients.create(dto);
  }
}
