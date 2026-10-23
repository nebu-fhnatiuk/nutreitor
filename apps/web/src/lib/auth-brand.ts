import type { BrandingDto } from "@nutreitor/shared";

import type { AuthBrand } from "@/components/auth/auth-shell";

/** Nombre visible y logo del club para las pantallas de acceso (KAN-77). */
export function authBrand(org: BrandingDto | null, slug: string): AuthBrand {
  return { name: org?.displayName || org?.name || slug, logoUrl: org?.brandLogoUrl ?? null };
}
