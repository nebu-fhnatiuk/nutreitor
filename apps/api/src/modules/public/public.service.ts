import { Injectable, NotFoundException } from "@nestjs/common";
import {
  memberships,
  organizations,
  professionalProfiles,
  users,
} from "@nutreitor/db";
import type { PublicOrg, PublicProfessional } from "@nutreitor/shared";
import { and, asc, eq, isNull } from "drizzle-orm";

import { TenantResolverService } from "../../core/auth/tenant-resolver.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import {
  hasPublicRosterContent,
  toPublicProfessional,
  toRosterEntry,
  type ProfileLike,
} from "./public-serializer.js";

/**
 * Lecturas públicas (pre-login). El ÚNICO paso owner/bypass es resolver slug→org
 * (bootstrap, vía tenantResolver). Todos los datos se leen con `runAs(orgId)`:
 * bajo RLS, scopeado al tenant resuelto. El `WHERE organization_id` implícito de
 * RLS + los filtros son la barrera; no hay ruta exenta de RLS.
 */
@Injectable()
export class PublicService {
  constructor(
    private readonly tenantResolver: TenantResolverService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async getOrg(slug: string): Promise<PublicOrg> {
    const org = await this.tenantResolver.bySlug(slug);
    if (!org) throw new NotFoundException();

    return this.tenantDb.runAs(org.id, async (tx) => {
      const [o] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, org.id))
        .limit(1);
      if (!o) throw new NotFoundException();

      const rows = await tx
        .select({
          profileSlug: professionalProfiles.profileSlug,
          isPubliclyListed: professionalProfiles.isPubliclyListed,
          specialty: professionalProfiles.specialty,
          headline: professionalProfiles.headline,
          bio: professionalProfiles.bio,
          photoUrl: professionalProfiles.photoUrl,
          credentials: professionalProfiles.credentials,
          specialties: professionalProfiles.specialties,
          services: professionalProfiles.services,
          visibility: professionalProfiles.visibility,
          fullName: users.fullName,
        })
        .from(professionalProfiles)
        .innerJoin(
          memberships,
          eq(memberships.id, professionalProfiles.membershipId),
        )
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(professionalProfiles.isPubliclyListed, true),
            isNull(memberships.revokedAt),
          ),
        )
        .orderBy(asc(professionalProfiles.displayOrder), asc(users.fullName));

      const roster = rows
        .map((r) => toRosterEntry(asProfileLike(r), r.fullName))
        .filter((e): e is NonNullable<typeof e> => e !== null);

      return {
        name: o.name,
        slug: o.slug,
        displayName: o.displayName,
        publicHeadline: o.publicHeadline,
        publicDescription: o.publicDescription,
        brandLogoUrl: o.brandLogoUrl,
        brandPrimaryColor: o.brandPrimaryColor,
        brandSecondaryColor: o.brandSecondaryColor,
        roster,
        singleProfessional: roster.length === 1,
      } satisfies PublicOrg;
    });
  }

  async getProfessional(
    slug: string,
    profileSlug: string,
  ): Promise<PublicProfessional> {
    const org = await this.tenantResolver.bySlug(slug);
    if (!org) throw new NotFoundException();

    return this.tenantDb.runAs(org.id, async (tx) => {
      const [row] = await tx
        .select({
          profileSlug: professionalProfiles.profileSlug,
          isPubliclyListed: professionalProfiles.isPubliclyListed,
          specialty: professionalProfiles.specialty,
          headline: professionalProfiles.headline,
          bio: professionalProfiles.bio,
          photoUrl: professionalProfiles.photoUrl,
          credentials: professionalProfiles.credentials,
          specialties: professionalProfiles.specialties,
          services: professionalProfiles.services,
          visibility: professionalProfiles.visibility,
          fullName: users.fullName,
        })
        .from(professionalProfiles)
        .innerJoin(
          memberships,
          eq(memberships.id, professionalProfiles.membershipId),
        )
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(professionalProfiles.profileSlug, profileSlug),
            eq(professionalProfiles.isPubliclyListed, true),
            isNull(memberships.revokedAt),
          ),
        )
        .limit(1);
      if (!row) throw new NotFoundException();
      const profile = asProfileLike(row);
      // La URL directa respeta la MISMA regla que el roster (Ajuste 1): si no hay
      // contenido público mínimo, el perfil no es alcanzable (404). Si no, un
      // perfil oculto de la grilla seguiría siendo enumerable por slug, filtrando
      // el nombre del profesional antes de que publique nada.
      if (!hasPublicRosterContent(profile)) throw new NotFoundException();
      return toPublicProfessional(profile, row.fullName);
    });
  }
}

/** Normaliza la fila de DB a la forma que esperan los serializers. */
function asProfileLike(r: {
  profileSlug: string;
  isPubliclyListed: boolean;
  specialty: string | null;
  headline: string | null;
  bio: string | null;
  photoUrl: string | null;
  credentials: string | null;
  specialties: string[] | null;
  services: { name: string; description?: string }[] | null;
  visibility: Record<string, boolean> | null;
}): ProfileLike {
  return {
    profileSlug: r.profileSlug,
    isPubliclyListed: r.isPubliclyListed,
    specialty: r.specialty,
    headline: r.headline,
    bio: r.bio,
    photoUrl: r.photoUrl,
    credentials: r.credentials,
    specialties: r.specialties ?? [],
    services: r.services ?? [],
    visibility: r.visibility ?? {},
  };
}
