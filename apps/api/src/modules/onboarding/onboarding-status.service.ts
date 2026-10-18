import { Injectable } from "@nestjs/common";
import {
  availabilityRules,
  memberships,
  organizations,
  professionalProfiles,
} from "@nutreitor/db";
import type { OnboardingStatus } from "@nutreitor/shared";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";

/**
 * Primeros pasos del workspace: se derivan de los datos (nada se tilda a mano), así
 * la checklist nunca miente. Corre bajo sesión y RLS.
 */
@Injectable()
export class OnboardingStatusService {
  constructor(private readonly tenantDb: TenantDbService) {}

  async get(): Promise<OnboardingStatus> {
    const ctx = getTenantContext();
    const { user } = getAuth();
    return this.tenantDb.run(async (tx) => {
      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId))
        .limit(1);

      const [mine] = await tx
        .select({
          membershipId: memberships.id,
          headline: professionalProfiles.headline,
          bio: professionalProfiles.bio,
          licenseStatus: professionalProfiles.licenseStatus,
        })
        .from(memberships)
        .leftJoin(professionalProfiles, eq(professionalProfiles.membershipId, memberships.id))
        .where(and(eq(memberships.userId, user.id), isNull(memberships.revokedAt)))
        .limit(1);

      const [{ rules }] = (await tx
        .select({ rules: sql<number>`count(*)::int` })
        .from(availabilityRules)) as [{ rules: number }];

      const [{ others }] = (await tx
        .select({ others: sql<number>`count(*)::int` })
        .from(memberships)
        .where(
          and(
            isNull(memberships.revokedAt),
            ne(memberships.role, "patient"),
            ne(memberships.userId, user.id),
          ),
        )) as [{ others: number }];

      return {
        status: org!.status,
        kind: org!.kind,
        reviewNote: org!.reviewNote,
        steps: {
          profile: !!(mine?.headline?.trim() || mine?.bio?.trim()),
          license: mine?.licenseStatus ?? "missing",
          branding: !!(org!.brandLogoUrl || org!.brandPrimaryColor || org!.displayName),
          availability: rules > 0,
          team: others > 0,
        },
      };
    });
  }
}
