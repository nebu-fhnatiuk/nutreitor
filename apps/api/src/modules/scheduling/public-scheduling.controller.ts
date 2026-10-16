import { Body, Controller, Get, NotFoundException, Param, Post, Query } from "@nestjs/common";
import {
  publicBookAppointmentSchema,
  type PublicBookAppointmentDto,
  type PublicBookingResult,
  type SlotDto,
} from "@nutreitor/shared";

import { TenantResolverService } from "../../core/auth/tenant-resolver.service.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { RateLimit } from "../../core/rate-limit/rate-limit.decorator.js";
import { PUBLIC_BOOK, PUBLIC_SLOTS } from "../../core/rate-limit/rate-limit.rules.js";
import { SchedulingService } from "./scheduling.service.js";

/**
 * Reserva PÚBLICA (vidriera, sin login): un visitante reserva una primera consulta
 * con un profesional listado. Mismo patrón que las lecturas públicas: la org se
 * resuelve por slug (owner, bootstrap) y los datos se operan bajo RLS (runAs) en el
 * service. El secreto de borde (proxy) ya gatea el acceso; no hay JWT.
 */
@Controller("public/orgs")
export class PublicSchedulingController {
  constructor(
    private readonly tenantResolver: TenantResolverService,
    private readonly scheduling: SchedulingService,
  ) {}

  @Get(":slug/professionals/:profileSlug/slots")
  @RateLimit(PUBLIC_SLOTS)
  async slots(
    @Param("slug") slug: string,
    @Param("profileSlug") profileSlug: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<SlotDto[]> {
    const org = await this.tenantResolver.bySlug(slug);
    if (!org) throw new NotFoundException();
    return this.scheduling.publicSlots(org, profileSlug, from, to);
  }

  @Post(":slug/professionals/:profileSlug/appointments")
  @RateLimit(PUBLIC_BOOK)
  async book(
    @Param("slug") slug: string,
    @Param("profileSlug") profileSlug: string,
    @Body(new ZodValidationPipe(publicBookAppointmentSchema)) dto: PublicBookAppointmentDto,
  ): Promise<PublicBookingResult> {
    const org = await this.tenantResolver.bySlug(slug);
    if (!org) throw new NotFoundException();
    return this.scheduling.publicBook(org, profileSlug, dto);
  }
}
