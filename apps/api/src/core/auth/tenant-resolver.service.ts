import { Injectable } from "@nestjs/common";
import { organizations } from "@nutreitor/db";
import type { AuthOrg, BrandingDto } from "@nutreitor/shared";
import { eq } from "drizzle-orm";

import { AdminDbService } from "../database/admin-db.service.js";

type OrgRow = typeof organizations.$inferSelect;

/**
 * Resuelve organizaciones para el flujo de auth. Es pre-auth (todavía no hay
 * contexto de tenant), así que usa la conexión OWNER que bypassa RLS. El slug
 * llega del hostname, no es un tenant_id de confianza: el resultado se valida
 * después contra los claims del JWT y el membership.
 */
@Injectable()
export class TenantResolverService {
  constructor(private readonly admin: AdminDbService) {}

  /** Org por slug (subdominio). */
  async bySlug(slug: string): Promise<AuthOrg | null> {
    const [org] = await this.admin.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    return org ? this.toAuthOrg(org) : null;
  }

  /**
   * Org por slug SÓLO si está aprobada: lo usan las rutas públicas (vidriera,
   * slots, reserva). Una org en revisión, rechazada o suspendida no existe para
   * el público (404, sin distinguir el motivo).
   */
  async publicBySlug(slug: string): Promise<AuthOrg | null> {
    const org = await this.bySlug(slug);
    return org?.status === "active" ? org : null;
  }

  /** Org por id (p. ej. al rotar un refresh token que ya tiene la org). */
  async byId(id: string): Promise<AuthOrg | null> {
    const [org] = await this.admin.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    return org ? this.toAuthOrg(org) : null;
  }

  /** Branding público por slug (para el login/workspace brandeado). */
  async brandingBySlug(slug: string): Promise<BrandingDto | null> {
    const [org] = await this.admin.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (!org) return null;
    return {
      name: org.name,
      slug: org.slug,
      region: org.region,
      displayName: org.displayName,
      brandLogoUrl: org.brandLogoUrl,
      brandPrimaryColor: org.brandPrimaryColor,
      brandSecondaryColor: org.brandSecondaryColor,
    };
  }

  private toAuthOrg(org: OrgRow): AuthOrg {
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      region: org.region,
      status: org.status,
      kind: org.kind,
    };
  }
}

