import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  memberships,
  professionalProfiles,
  users,
  type TenantTx,
} from "@nutreitor/db";
import type {
  OwnProfessionalProfile,
  ProfileVisibility,
  UpdateProfessionalProfileDto,
} from "@nutreitor/shared";
import { and, eq, isNull, ne } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { isReservedSlug } from "../../core/util/slug.js";
import { ensureProfessionalProfile } from "./profile-provisioning.js";

type ProfileRow = typeof professionalProfiles.$inferSelect;
type LoadedProfile = { profile: ProfileRow; fullName: string };

/**
 * Perfil público propio del profesional (vidriera por membership). Resuelve el
 * membership de la SESIÓN (ALS) bajo RLS: el profesional sólo toca su propio perfil.
 * El admin cura presencia/orden (roster); acá el dueño edita contenido + visibilidad.
 */
@Injectable()
export class ProfessionalProfileService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  async getMine(): Promise<OwnProfessionalProfile> {
    return this.tenantDb.run(async (tx) => {
      const { profile, fullName } = await this.loadMine(tx);
      return toOwnProfile(profile, fullName);
    });
  }

  async updateMine(
    dto: UpdateProfessionalProfileDto,
  ): Promise<OwnProfessionalProfile> {
    return this.tenantDb.run(async (tx) => {
      const { profile: current, fullName } = await this.loadMine(tx);

      const patch: Partial<typeof professionalProfiles.$inferInsert> = {};
      if (dto.headline !== undefined) patch.headline = dto.headline;
      if (dto.bio !== undefined) patch.bio = dto.bio;
      if (dto.photoUrl !== undefined) patch.photoUrl = dto.photoUrl;
      if (dto.credentials !== undefined) patch.credentials = dto.credentials;
      if (dto.specialties !== undefined) patch.specialties = dto.specialties;
      if (dto.services !== undefined) patch.services = dto.services;
      if (dto.visibility !== undefined) patch.visibility = dto.visibility;

      if (
        dto.profileSlug !== undefined &&
        dto.profileSlug !== current.profileSlug
      ) {
        await this.assertSlugAvailable(tx, dto.profileSlug, current.id);
        patch.profileSlug = dto.profileSlug;
      }

      const changed = Object.keys(patch);
      if (changed.length === 0) return toOwnProfile(current, fullName);

      const [row] = await tx
        .update(professionalProfiles)
        .set(patch)
        .where(eq(professionalProfiles.id, current.id))
        .returning();
      await this.audit.recordForSession(tx, {
        action: "professional.profile_updated",
        targetType: "professional_profile",
        targetId: current.id,
        metadata: { fields: changed },
      });
      return toOwnProfile(row!, fullName);
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * Carga el perfil del membership activo de la sesión (RLS por org) + el nombre.
   * Si el membership no tiene perfil (anterior a 0011, o borrado), lo provisiona
   * en el acto (create-on-read) con el helper compartido — así "Mi perfil" nunca
   * queda inutilizable.
   */
  private async loadMine(tx: TenantTx): Promise<LoadedProfile> {
    const { user } = getAuth();
    const ctx = getTenantContext();
    const [m] = await tx
      .select({ membershipId: memberships.id, fullName: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.userId, user.id), isNull(memberships.revokedAt)))
      .limit(1);
    if (!m) {
      throw new NotFoundException("No tenés un membership activo en esta organización.");
    }
    const profile = await ensureProfessionalProfile(tx, {
      membershipId: m.membershipId,
      organizationId: ctx.orgId,
      region: ctx.region,
      fullName: m.fullName,
    });
    return { profile, fullName: m.fullName };
  }

  /** El slug debe ser no-reservado y único por org (RLS acota a la org). */
  private async assertSlugAvailable(
    tx: TenantTx,
    slug: string,
    selfId: string,
  ): Promise<void> {
    if (isReservedSlug(slug)) {
      throw new ConflictException("Ese slug está reservado.");
    }
    const [clash] = await tx
      .select({ id: professionalProfiles.id })
      .from(professionalProfiles)
      .where(
        and(
          eq(professionalProfiles.profileSlug, slug),
          ne(professionalProfiles.id, selfId),
        ),
      )
      .limit(1);
    if (clash) throw new ConflictException("Ese slug ya está en uso.");
  }
}

function toOwnProfile(
  row: ProfileRow,
  fullName: string,
): OwnProfessionalProfile {
  return {
    profileSlug: row.profileSlug,
    fullName,
    headline: row.headline,
    bio: row.bio,
    photoUrl: row.photoUrl,
    credentials: row.credentials,
    specialties: row.specialties ?? [],
    services: row.services ?? [],
    visibility: (row.visibility ?? {}) as ProfileVisibility,
    isPubliclyListed: row.isPubliclyListed,
  };
}
