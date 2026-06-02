import { Injectable } from "@nestjs/common";
import { organizations } from "@nutreitor/db";
import type { AuthOrg } from "@nutreitor/shared";
import { eq } from "drizzle-orm";

import { AdminDbService } from "../database/admin-db.service.js";

/**
 * Resuelve `slug` (subdominio) → organización. Es una operación pre-auth
 * (todavía no hay contexto de tenant), así que usa la conexión OWNER que bypassa
 * RLS. El slug llega del hostname, no es un tenant_id de confianza: el resultado
 * se valida después contra los claims del JWT y el membership.
 */
@Injectable()
export class TenantResolverService {
  constructor(private readonly admin: AdminDbService) {}

  async bySlug(slug: string): Promise<AuthOrg | null> {
    const [org] = await this.admin.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (!org) return null;
    return { id: org.id, name: org.name, slug: org.slug, region: org.region };
  }
}
