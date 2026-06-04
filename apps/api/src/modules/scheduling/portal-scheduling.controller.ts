import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  bookAppointmentSchema,
  type AppointmentDto,
  type BookAppointmentDto,
  type SlotDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { SchedulingService } from "./scheduling.service.js";

/**
 * Agendamiento del lado del PACIENTE (portal). Superficie angosta: el service
 * resuelve "mi paciente" + su profesional asignado por la sesión; nunca recibe un
 * patientId/membershipId del cliente.
 */
@Controller("portal")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class PortalSchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get("slots")
  @RequireCapability("portal:book")
  slots(@Query("from") from?: string, @Query("to") to?: string): Promise<SlotDto[]> {
    return this.scheduling.slotsForMyPatient(from, to);
  }

  @Get("appointments")
  @RequireCapability("portal:read")
  list(): Promise<AppointmentDto[]> {
    return this.scheduling.myAppointments();
  }

  @Post("appointments")
  @RequireCapability("portal:book")
  book(
    @Body(new ZodValidationPipe(bookAppointmentSchema)) dto: BookAppointmentDto,
  ): Promise<AppointmentDto> {
    return this.scheduling.bookAsPatient(dto);
  }

  @Post("appointments/:id/cancel")
  @RequireCapability("portal:book")
  async cancel(@Param("id") id: string): Promise<{ ok: true }> {
    await this.scheduling.cancel(id, "patient");
    return { ok: true };
  }
}
