/** Une clases condicionales (filtra falsy). Helper mínimo, sin dependencias. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
