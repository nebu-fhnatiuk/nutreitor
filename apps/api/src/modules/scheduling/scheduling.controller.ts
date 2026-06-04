import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  bookAppointmentSchema,
  rescheduleAppointmentSchema,
  setAvailabilitySchema,
  type AppointmentDto,
  type AvailabilityDto,
  type BookAppointmentDto,
  type RescheduleAppointmentDto,
  type SetAvailabilityDto,
  type SlotDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { SchedulingService } from "./scheduling.service.js";

/**
 * Agendamiento del lado profesional/admin. El profesional gestiona su propia
 * disponibilidad y agenda; el scoping fino (sobre lo suyo / paciente asignado) lo
 * aplica el service. Admin ve todas las citas del tenant.
 */
@Controller("scheduling")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get("availability")
  @RequireCapability("appointment:read")
  getAvailability(): Promise<AvailabilityDto> {
    return this.scheduling.getMyAvailability();
  }

  @Put("availability")
  @RequireCapability("appointment:write")
  setAvailability(
    @Body(new ZodValidationPipe(setAvailabilitySchema)) dto: SetAvailabilityDto,
  ): Promise<AvailabilityDto> {
    return this.scheduling.setMyAvailability(dto);
  }

  @Get("slots")
  @RequireCapability("appointment:read")
  slots(@Query("from") from?: string, @Query("to") to?: string): Promise<SlotDto[]> {
    return this.scheduling.mySlots(from, to);
  }

  @Get("appointments")
  @RequireCapability("appointment:read")
  list(@Query("from") from?: string, @Query("to") to?: string): Promise<AppointmentDto[]> {
    return this.scheduling.listForProfessional(from, to);
  }

  @Post("appointments")
  @RequireCapability("appointment:write")
  book(
    @Body(new ZodValidationPipe(bookAppointmentSchema)) dto: BookAppointmentDto,
  ): Promise<AppointmentDto> {
    return this.scheduling.bookForPatient(dto);
  }

  @Post("appointments/:id/cancel")
  @RequireCapability("appointment:write")
  async cancel(@Param("id") id: string): Promise<{ ok: true }> {
    await this.scheduling.cancel(id, "professional");
    return { ok: true };
  }

  @Post("appointments/:id/reschedule")
  @RequireCapability("appointment:write")
  reschedule(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rescheduleAppointmentSchema)) dto: RescheduleAppointmentDto,
  ): Promise<AppointmentDto> {
    return this.scheduling.reschedule(id, dto);
  }
}
