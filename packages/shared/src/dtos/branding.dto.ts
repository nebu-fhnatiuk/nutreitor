import { z } from "zod";

/** Color hex de 6 dígitos, con o sin `#`. */
const hexColor = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}$/, "color hex inválido (6 dígitos)");

/**
 * Update de branding white-label (acotado). `null` limpia el campo; `undefined`
 * lo deja como está. Sólo nombre visible, logo y dos colores.
 */
export const updateBrandingSchema = z.object({
  displayName: z.string().min(1).max(200).nullish(),
  brandLogoUrl: z.string().url().nullish(),
  brandPrimaryColor: hexColor.nullish(),
  brandSecondaryColor: hexColor.nullish(),
});

export type UpdateBrandingDto = z.infer<typeof updateBrandingSchema>;

/** Branding servido al front (público por tenant). */
export interface BrandingDto {
  name: string;
  slug: string;
  region: string;
  displayName: string | null;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
}
