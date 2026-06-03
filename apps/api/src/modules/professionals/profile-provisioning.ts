import { professionalProfiles, type TenantTx } from "@nutreitor/db";
import type { Region } from "@nutreitor/shared";
import { and, eq } from "drizzle-orm";

import { isReservedSlug, slugify } from "../../core/util/slug.js";

type ProfileRow = typeof professionalProfiles.$inferSelect;

/**
 * Crea (si falta) el perfil público de un membership y lo devuelve. Idempotente:
 * si ya existe, lo retorna sin tocar. El `profileSlug` se genera kebab(fullName)
 * con dedupe por org y blocklist de slugs reservados del workspace. Visibilidad
 * vacía (todo privado): el profesional cura su vidriera después.
 *
 * Única fuente de provisioning de perfiles: la usa `accept()` (alta por invitación)
 * y `professional-profile.service` (create-on-read, para memberships sin perfil —
 * p. ej. anteriores a la migración 0011 o con el perfil borrado).
 */
export async function ensureProfessionalProfile(
  tx: TenantTx,
  params: {
    membershipId: string;
    organizationId: string;
    region: Region;
    fullName: string;
  },
): Promise<ProfileRow> {
  const { membershipId, organizationId, region, fullName } = params;

  const [existing] = await tx
    .select()
    .from(professionalProfiles)
    .where(eq(professionalProfiles.membershipId, membershipId))
    .limit(1);
  if (existing) return existing;

  const base = slugify(fullName);
  let slug = base;
  let n = 1;
  // Dedupe por org + evitar reservados.
  for (;;) {
    const reserved = isReservedSlug(slug);
    const [clash] = reserved
      ? [{ id: "reserved" }]
      : await tx
          .select({ id: professionalProfiles.id })
          .from(professionalProfiles)
          .where(
            and(
              eq(professionalProfiles.organizationId, organizationId),
              eq(professionalProfiles.profileSlug, slug),
            ),
          )
          .limit(1);
    if (!clash) break;
    n += 1;
    slug = `${base}-${n}`;
  }

  const [created] = await tx
    .insert(professionalProfiles)
    .values({
      organizationId,
      region,
      membershipId,
      profileSlug: slug,
      isPubliclyListed: true,
      visibility: {},
    })
    .returning();
  return created!;
}
