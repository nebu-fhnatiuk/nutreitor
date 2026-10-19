import { ConflictException, Injectable } from "@nestjs/common";
import { invitations, memberships, organizations } from "@nutreitor/db";
import type {
  ChangeOrgKindDto,
  OrgKind,
  BrandingDto,
  CreateOrganizationDto,
  OrganizationDto,
  UpdateBrandingDto,
  UpdateOrgPublicProfileDto,
} from "@nutreitor/shared";
import { and, desc, eq, isNull, ne } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { AdminDbService } from "../../core/database/admin-db.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";

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
   * Cambia el tipo de la org (ADR 0026). A `team` siempre se puede; a `individual`
   * sólo si la admin es la única persona del equipo (sin colegas activos ni
   * invitaciones de equipo pendientes).
   */
  async changeKind(dto: ChangeOrgKindDto): Promise<{ kind: OrgKind }> {
    const ctx = getTenantContext();
    const { user } = getAuth();
    return this.tenantDb.run(async (tx) => {
      if (dto.kind === "individual") {
        const [colleague] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              isNull(memberships.revokedAt),
              ne(memberships.role, "patient"),
              ne(memberships.userId, user.id),
            ),
          )
          .limit(1);
        const [invite] = await tx
          .select({ id: invitations.id })
          .from(invitations)
          .where(and(eq(invitations.status, "pending"), ne(invitations.role, "patient")))
          .limit(1);
        if (colleague || invite) {
          throw new ConflictException(
            "Para pasar a independiente no tiene que haber otras personas en el equipo ni invitaciones de equipo pendientes.",
          );
        }
      }
      const [row] = await tx
        .update(organizations)
        .set({ kind: dto.kind })
        .where(eq(organizations.id, ctx.orgId))
        .returning({ kind: organizations.kind });
      await this.audit.recordForSession(tx, {
        action: "org.kind_changed",
        targetType: "organization",
        targetId: ctx.orgId,
        metadata: { kind: dto.kind },
      });
      return { kind: row!.kind };
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
