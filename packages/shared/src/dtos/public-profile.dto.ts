import { z } from "zod";

/** Campos del perfil con visibilidad por-campo (default privado). `fullName` y la
 * presencia en el roster son públicos por definición; el resto se cura. */
export const profileVisibilityFields = [
  "headline",
  "bio",
  "photoUrl",
  "credentials",
  "specialties",
  "services",
] as const;
export type ProfileVisibilityField = (typeof profileVisibilityFields)[number];
export type ProfileVisibility = Partial<Record<ProfileVisibilityField, boolean>>;

export interface PublicService {
  name: string;
  description?: string;
}

/** Resumen público de un profesional en el roster de la org. */
export interface PublicRosterEntry {
  profileSlug: string;
  fullName: string;
  headline: string | null;
  photoUrl: string | null;
  specialty: string | null;
}

/** Perfil público completo (sólo campos marcados visibles). */
export interface PublicProfessional {
  profileSlug: string;
  fullName: string;
  headline: string | null;
  bio: string | null;
  photoUrl: string | null;
  credentials: string | null;
  specialties: string[];
  services: PublicService[];
  /** Matrícula revisada por la plataforma ("MN 1234 · Nacional"); siempre pública. */
  license: string | null;
}

/** Página pública de la organización. */
export interface PublicOrg {
  name: string;
  slug: string;
  displayName: string | null;
  publicHeadline: string | null;
  publicDescription: string | null;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  roster: PublicRosterEntry[];
  /** true si hay exactamente un profesional listado → modo perfil-único. */
  singleProfessional: boolean;
}

/** Estado de la matrícula (espeja el enum de la DB). Sólo `reviewed` es público. */
export const licenseStatuses = ["missing", "declared", "reviewed", "rejected"] as const;
export type LicenseStatus = (typeof licenseStatuses)[number];

/** Texto público de la matrícula. */
export function formatLicense(number: string | null, jurisdiction: string | null): string | null {
  if (!number) return null;
  return jurisdiction ? `${number} · ${jurisdiction}` : number;
}

// ── Edición (PR 2) ────────────────────────────────────────────────────────────

const profileSlugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug inválido (kebab-case)");

const servicesSchema = z
  .array(
    z.object({
      name: z.string().min(1).max(120),
      description: z.string().max(500).optional(),
    }),
  )
  .max(50);

/** Update del perfil del profesional (propio). `null` limpia, `undefined` no toca. */
export const updateProfessionalProfileSchema = z.object({
  profileSlug: profileSlugSchema.optional(),
  headline: z.string().max(160).nullish(),
  bio: z.string().max(4000).nullish(),
  photoUrl: z.string().url().nullish(),
  credentials: z.string().max(2000).nullish(),
  specialties: z.array(z.string().min(1).max(80)).max(30).optional(),
  services: servicesSchema.optional(),
  visibility: z.record(z.enum(profileVisibilityFields), z.boolean()).optional(),
  // Cambiar la matrícula la vuelve a `declared` (la plataforma la revisa de nuevo).
  licenseNumber: z.string().trim().min(2).max(40).nullish(),
  licenseJurisdiction: z.string().trim().min(2).max(80).nullish(),
});
export type UpdateProfessionalProfileDto = z.infer<
  typeof updateProfessionalProfileSchema
>;

/** Update de la página pública de la org (admin). */
export const updateOrgPublicProfileSchema = z.object({
  publicHeadline: z.string().max(160).nullish(),
  publicDescription: z.string().max(4000).nullish(),
});
export type UpdateOrgPublicProfileDto = z.infer<
  typeof updateOrgPublicProfileSchema
>;

/** Vista admin de una entrada del roster: incluye no-listados y sin contenido
 * (a diferencia del roster público). `hasPublicContent` refleja la regla del
 * serializer (Ajuste 1) para advertir por qué un profesional no aparece. */
export interface RosterAdminEntry {
  membershipId: string;
  fullName: string;
  profileSlug: string;
  isPubliclyListed: boolean;
  displayOrder: number;
  specialty: string | null;
  hasPublicContent: boolean;
  /** Sin matrícula revisada el perfil no es público, aunque esté listado. */
  licenseStatus: LicenseStatus;
}

/** Curaduría del roster (admin), por membership. */
export const updateRosterSchema = z.object({
  isPubliclyListed: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(100000).optional(),
  specialty: z.string().max(120).nullish(),
});
export type UpdateRosterDto = z.infer<typeof updateRosterSchema>;

/** Vista de edición del profesional propio (incluye campos privados + visibilidad). */
export interface OwnProfessionalProfile {
  profileSlug: string;
  fullName: string;
  headline: string | null;
  bio: string | null;
  photoUrl: string | null;
  credentials: string | null;
  specialties: string[];
  services: PublicService[];
  visibility: ProfileVisibility;
  isPubliclyListed: boolean;
  licenseNumber: string | null;
  licenseJurisdiction: string | null;
  licenseStatus: LicenseStatus;
  /** Motivo si la plataforma la rechazó. */
  licenseNote: string | null;
}
