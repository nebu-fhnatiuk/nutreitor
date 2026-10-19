/** Slugs reservados por el namespace de workspace (no pueden ser profileSlug). */
export const RESERVED_SLUGS = new Set([
  "login",
  "admin",
  "pro",
  "app",
  "accept",
  "olvide",
  "restablecer",
  "api",
  "_next",
]);

/** Normaliza un texto a kebab-case ASCII apto para URL. */
export function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca diacríticos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  return base || "perfil";
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
