/**
 * Convierte un color hex (#rrggbb o rrggbb) al triplete "r g b" que consumen las
 * CSS variables de marca (`--brand-rgb`). Devuelve null si no es válido.
 */
export function hexToRgbTriplet(hex?: string | null): string | null {
  if (!hex) return null;
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
