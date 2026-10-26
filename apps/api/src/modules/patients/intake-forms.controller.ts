import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  requestIntakeSchema,
  reviewIntakeSchema,
  type IntakeRequestDto,
  type PortalIntakeDto,
  type RequestIntakeDto,
  type ReviewIntakeDto,
} from "@nutreitor/shared";

import { LogsAccess } from "../../core/audit/access-log.decorator.js";
import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { IntakeFormsService } from "./intake-forms.service.js";

/** Formularios previos a la consulta, del lado del profesional (KAN-60). */
@Controller("patients/:patientId/intake-requests")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class IntakeFormsController {
  constructor(private readonly forms: IntakeFormsService) {}

  @Get()
  @LogsAccess("patient", { patientParam: "patientId" })
  @RequireCapability("patient:read")
  list(@Param("patientId", ParseUUIDPipe) patientId: string): Promise<IntakeRequestDto[]> {
    return this.forms.list(patientId);
  }

  @Post()
  @RequireCapability("patient:update")
  request(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Body(new ZodValidationPipe(requestIntakeSchema)) dto: RequestIntakeDto,
  ): Promise<IntakeRequestDto> {
    return this.forms.request(patientId, dto);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequireCapability("patient:update")
  cancel(@Param("patientId", ParseUUIDPipe) patientId: string, @Param("id", ParseUUIDPipe) id: string): Promise<IntakeRequestDto> {
    return this.forms.cancel(patientId, id);
  }

  @Post(":id/review")
  @HttpCode(200)
  @RequireCapability("patient:update")
  review(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewIntakeSchema)) dto: ReviewIntakeDto,
  ): Promise<IntakeRequestDto> {
    return this.forms.review(patientId, id, dto);
  }
}

/** Los formularios que el deportista tiene que completar, en su portal. */
@Controller("portal/me/intake-requests")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class PortalIntakeFormsController {
  constructor(private readonly forms: IntakeFormsService) {}

  @Get()
  @RequireCapability("portal:read")
  mine(): Promise<PortalIntakeDto[]> {
    return this.forms.mine();
  }

  /** El cuerpo se valida con el schema del tipo de formulario (en el servicio). */
  @Post(":id/submit")
  @HttpCode(200)
  @RequireCapability("portal:self_report")
  submit(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<PortalIntakeDto> {
    return this.forms.submit(id, body);
  }
}
