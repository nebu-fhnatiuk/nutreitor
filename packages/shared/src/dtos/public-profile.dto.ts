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
}
