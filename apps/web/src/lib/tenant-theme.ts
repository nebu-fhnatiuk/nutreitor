/**
 * White-label por organización (STUB).
 *
 * El tema (color de marca, logo, nombre) se sirve por tenant SIN recompilar: se
 * expone como CSS variables que el layout inyecta en runtime. Hoy devuelve un
 * default; mañana resuelve `slug` (subdominio) contra el backend
 * (organizations.slug) y trae la config real del tenant.
 */
export interface TenantTheme {
  name: string;
  /** Triplete RGB "r g b" para casar con las CSS variables de Tailwind. */
  brandRgb: string;
  brandFgRgb: string;
  logoUrl?: string;
}

const DEFAULT_THEME: TenantTheme = {
  name: "Nutreitor",
  brandRgb: "16 122 87", // emerald
  brandFgRgb: "255 255 255",
};

export function getTenantTheme(slug?: string): TenantTheme {
  // TODO: resolver `slug` -> config white-label del tenant vía API.
  void slug;
  return DEFAULT_THEME;
}
