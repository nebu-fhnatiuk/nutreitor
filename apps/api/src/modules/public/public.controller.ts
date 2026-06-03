import { Controller, Get, Param } from "@nestjs/common";
import type { PublicOrg, PublicProfessional } from "@nutreitor/shared";

import { PublicService } from "./public.service.js";

/**
 * Lecturas públicas (sin JWT; igual pasan por el secreto de borde vía proxy).
 * Tenant por param `slug`; los datos se sirven bajo RLS (ver PublicService).
 */
@Controller("public/orgs")
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get(":slug")
  org(@Param("slug") slug: string): Promise<PublicOrg> {
    return this.publicService.getOrg(slug);
  }

  @Get(":slug/professionals/:profileSlug")
  professional(
    @Param("slug") slug: string,
    @Param("profileSlug") profileSlug: string,
  ): Promise<PublicProfessional> {
    return this.publicService.getProfessional(slug, profileSlug);
  }
}
