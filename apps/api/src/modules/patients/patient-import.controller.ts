import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import {
  importPatientsSchema,
  type ImportPatientsDto,
  type ImportPreviewDto,
  type ImportResultDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { PatientImportService } from "./patient-import.service.js";

/** Alta masiva desde un CSV (KAN-42). Sólo quien puede dar de alta y asignar. */
@Controller("patients/import")
@UseGuards(JwtAuthGuard, CapabilityGuard)
@RequireCapability("patient:create", "patient:assign")
export class PatientImportController {
  constructor(private readonly importer: PatientImportService) {}

  /** Valida sin escribir: errores por fila para la vista previa. */
  @Post("preview")
  @HttpCode(200)
  preview(@Body(new ZodValidationPipe(importPatientsSchema)) dto: ImportPatientsDto): Promise<ImportPreviewDto> {
    return this.importer.preview(dto);
  }

  /** Todo o nada: con una fila con error no se importa ninguna (422 + vista previa). */
  @Post()
  import(@Body(new ZodValidationPipe(importPatientsSchema)) dto: ImportPatientsDto): Promise<ImportResultDto> {
    return this.importer.import(dto);
  }
}
