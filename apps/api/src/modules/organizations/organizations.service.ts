import { Injectable } from "@nestjs/common";
import { organizations } from "@nutreitor/db";
import type {
  BrandingDto,
  CreateOrganizationDto,
  OrganizationDto,
  UpdateBrandingDto,
  UpdateOrgPublicProfileDto,
} from "@nutreitor/shared";
import { desc, eq } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { AdminDbService } from "../../core/database/admin-db.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getTenantContext } from "../../core/tenant/tenant-context.store.js";

/**
 * Organizaciones. El alta/listado es control-plane (rol owner, fuera de RLS). El
 * branding lo edita el admin del propio tenant: corre bajo sesión (RLS permite al
 * rol app actualizar su propia org) y queda auditado.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly admin: AdminDbService,
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateOrganizationDto): Promise<OrganizationDto> {
    const [row] = await this.admin.db
      .insert(organizations)
      .values(dto)
      .returning();
    return toDto(row!);
  }

  async list(): Promise<OrganizationDto[]> {
    const rows = await this.admin.db
      .select()
      .from(organizations)
      .orderBy(desc(organizations.createdAt));
    return rows.map(toDto);
  }

  /** Actualiza el branding del tenant actual (org:update_branding) + audit. */
  async updateBranding(dto: UpdateBrandingDto): Promise<BrandingDto> {
    const ctx = getTenantContext();
    // Sólo los campos presentes (undefined = sin cambio; null = limpiar).
    const patch: Partial<typeof organizations.$inferInsert> = {};
    if (dto.displayName !== undefined) patch.displayName = dto.displayName;
    if (dto.brandLogoUrl !== undefined) patch.brandLogoUrl = dto.brandLogoUrl;
    if (dto.brandPrimaryColor !== undefined) patch.brandPrimaryColor = dto.brandPrimaryColor;
    if (dto.brandSecondaryColor !== undefined)
      patch.brandSecondaryColor = dto.brandSecondaryColor;

    const changed = Object.keys(patch);

    return this.tenantDb.run(async (tx) => {
      const [row] =
        changed.length > 0
          ? await tx
              .update(organizations)
              .set(patch)
              .where(eq(organizations.id, ctx.orgId))
              .returning()
          : await tx
              .select()
              .from(organizations)
              .where(eq(organizations.id, ctx.orgId))
              .limit(1);
      // Sólo auditar si hubo cambios reales (evita filas no-op en el log inmutable).
      if (changed.length > 0) {
        await this.audit.recordForSession(tx, {
          action: "org.branding_updated",
          targetType: "organization",
          targetId: ctx.orgId,
          metadata: { fields: changed },
        });
      }
      return toBranding(row!);
    });
  }

  /**
   * Edita la página pública de la org (headline/description) — capa de captación.
   * Corre bajo sesión admin (RLS permite a la org actualizarse a sí misma) + audit.
   * Devuelve los campos públicos resultantes.
   */
  async updatePublicProfile(
    dto: UpdateOrgPublicProfileDto,
  ): Promise<{ publicHeadline: string | null; publicDescription: string | null }> {
    const ctx = getTenantContext();
    const patch: Partial<typeof organizations.$inferInsert> = {};
    if (dto.publicHeadline !== undefined) patch.publicHeadline = dto.publicHeadline;
    if (dto.publicDescription !== undefined)
      patch.publicDescription = dto.publicDescription;

    const changed = Object.keys(patch);

    return this.tenantDb.run(async (tx) => {
      const [row] =
        changed.length > 0
          ? await tx
              .update(organizations)
              .set(patch)
              .where(eq(organizations.id, ctx.orgId))
              .returning()
          : await tx
              .select()
              .from(organizations)
              .where(eq(organizations.id, ctx.orgId))
              .limit(1);
      if (changed.length > 0) {
        await this.audit.recordForSession(tx, {
          action: "org.public_profile_updated",
          targetType: "organization",
          targetId: ctx.orgId,
          metadata: { fields: changed },
        });
      }
      return {
        publicHeadline: row!.publicHeadline,
        publicDescription: row!.publicDescription,
      };
    });
  }
}

function toDto(row: typeof organizations.$inferSelect): OrganizationDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    region: row.region,
    createdAt: row.createdAt.toISOString(),
  };
}

function toBranding(row: typeof organizations.$inferSelect): BrandingDto {
  return {
    name: row.name,
    slug: row.slug,
    region: row.region,
    displayName: row.displayName,
    brandLogoUrl: row.brandLogoUrl,
    brandPrimaryColor: row.brandPrimaryColor,
    brandSecondaryColor: row.brandSecondaryColor,
  };
}
