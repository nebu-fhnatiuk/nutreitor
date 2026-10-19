import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  acceptContactSchema,
  contactListQuerySchema,
  declineContactSchema,
  forwardContactSchema,
  publicContactSchema,
  type AcceptContactDto,
  type AcceptContactResult,
  type ContactListQueryDto,
  type ContactRequestDto,
  type DeclineContactDto,
  type ForwardContactDto,
  type PublicContactDto,
  type PublicContactResult,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { TenantResolverService } from "../../core/auth/tenant-resolver.service.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { RateLimit } from "../../core/rate-limit/rate-limit.decorator.js";
import { PUBLIC_CONTACT_BY_EMAIL, PUBLIC_CONTACT_BY_IP } from "../../core/rate-limit/rate-limit.rules.js";
import { ContactService } from "./contact.service.js";

/** Formulario de la vidriera (sin JWT; org activa por slug, bajo RLS). */
@Controller("public/orgs")
export class PublicContactController {
  constructor(
    private readonly contact: ContactService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  @Post(":slug/contact")
  @HttpCode(201)
  @RateLimit(PUBLIC_CONTACT_BY_IP, PUBLIC_CONTACT_BY_EMAIL)
  async create(
    @Param("slug") slug: string,
    @Body(new ZodValidationPipe(publicContactSchema)) dto: PublicContactDto,
  ): Promise<PublicContactResult> {
    const org = await this.tenantResolver.publicBySlug(slug);
    if (!org) throw new NotFoundException();
    return this.contact.createPublic(org, dto);
  }
}

/** Bandeja de solicitudes (destinatario). */
@Controller("contact-requests")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class ContactRequestsController {
  constructor(private readonly contact: ContactService) {}

  @Get()
  @RequireCapability("contact:respond")
  list(@Query(new ZodValidationPipe(contactListQuerySchema)) q: ContactListQueryDto): Promise<ContactRequestDto[]> {
    return this.contact.list(q);
  }

  @Get("count")
  @RequireCapability("contact:respond")
  count(): Promise<{ new: number }> {
    return this.contact.count();
  }

  @Post(":id/accept")
  @RequireCapability("contact:respond")
  accept(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(acceptContactSchema)) dto: AcceptContactDto,
  ): Promise<AcceptContactResult> {
    return this.contact.accept(id, dto);
  }

  @Post(":id/decline")
  @HttpCode(204)
  @RequireCapability("contact:respond")
  decline(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(declineContactSchema)) dto: DeclineContactDto,
  ): Promise<void> {
    return this.contact.decline(id, dto);
  }

  @Post(":id/forward")
  @HttpCode(204)
  @RequireCapability("patient:assign")
  forward(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(forwardContactSchema)) dto: ForwardContactDto,
  ): Promise<void> {
    return this.contact.forward(id, dto);
  }
}
