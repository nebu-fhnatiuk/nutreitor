/**
 * Colores del club (KAN-69): a partir de los dos colores de la camiseta, la paleta
 * completa del tema Estadio con el contraste controlado (WCAG 2.1 AA). Función pura:
 * la usan el layout del tenant (CSS vars) y la vista previa de la configuración.
 *
 * - `fg`: texto sobre un relleno del color (blanco o tinta, el de mayor contraste).
 * - `onLight` / `onDark`: el color ajustado para usarlo como TEXTO sobre la
 *   superficie clara (#FFFFFF) u oscura (#121821) del tema, con 4.5:1 como mínimo.
 *   Si el color ya alcanza, queda igual; si no, se oscurece o aclara de a poco.
 */

export type Rgb = readonly [number, number, number];

export const SURFACE_LIGHT: Rgb = [255, 255, 255];
export const SURFACE_DARK: Rgb = [18, 24, 33];
const INK: Rgb = [17, 24, 39];
const WHITE: Rgb = [255, 255, 255];
/** AA para texto normal. */
export const AA = 4.5;

export const DEFAULT_PRIMARY = "#107A57";
export const DEFAULT_SECONDARY = "#F28C28";

export function parseHex(hex: string | null | undefined): Rgb | null {
  if (!hex) return null;
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const toHex = (c: Rgb) => `#${c.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
/** "r g b", el formato de las CSS vars del tema. */
export const toTriplet = (c: Rgb) => c.join(" ");

/** Luminancia relativa (WCAG 2.1). */
export function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as unknown as Rgb;

/** El color más parecido al original que llega a `min` sobre `bg` (mezclando hacia `toward`). */
function reach(c: Rgb, bg: Rgb, toward: Rgb, min = AA): Rgb {
  if (contrast(c, bg) >= min) return c;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const m = mix(c, toward, t);
    if (contrast(m, bg) >= min) return m;
  }
  return toward;
}

export interface ClubColor {
  base: Rgb;
  fg: Rgb;
  onLight: Rgb;
  onDark: Rgb;
}

function clubColor(base: Rgb): ClubColor {
  const fg = contrast(base, WHITE) >= contrast(base, INK) ? WHITE : INK;
  return { base, fg, onLight: reach(base, SURFACE_LIGHT, INK), onDark: reach(base, SURFACE_DARK, WHITE) };
}

export interface PaletteCheck {
  label: string;
  ratio: number;
  ok: boolean;
  /** Se usó un tono ajustado para llegar a AA. */
  adjusted?: boolean;
}

export interface ClubPalette {
  primary: ClubColor;
  secondary: ClubColor;
  checks: PaletteCheck[];
  /** Los dos colores casi no se distinguen entre sí (útil para el aviso de la vista previa). */
  tooSimilar: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function clubPalette(primaryHex?: string | null, secondaryHex?: string | null): ClubPalette {
  const primary = clubColor(parseHex(primaryHex) ?? parseHex(DEFAULT_PRIMARY)!);
  const secondary = clubColor(parseHex(secondaryHex) ?? parseHex(DEFAULT_SECONDARY)!);
  const check = (label: string, a: Rgb, b: Rgb, base?: Rgb): PaletteCheck => {
    const ratio = r1(contrast(a, b));
    return { label, ratio, ok: ratio >= AA, ...(base && toHex(base) !== toHex(a) ? { adjusted: true } : {}) };
  };
  return {
    primary,
    secondary,
    checks: [
      check("Texto sobre el color principal", primary.fg, primary.base),
      check("Texto sobre el segundo color", secondary.fg, secondary.base),
      check("Color principal como texto (claro)", primary.onLight, SURFACE_LIGHT, primary.base),
      check("Color principal como texto (oscuro)", primary.onDark, SURFACE_DARK, primary.base),
      check("Segundo color como texto (claro)", secondary.onLight, SURFACE_LIGHT, secondary.base),
      check("Segundo color como texto (oscuro)", secondary.onDark, SURFACE_DARK, secondary.base),
    ],
    tooSimilar: contrast(primary.base, secondary.base) < 1.3,
  };
}

/** CSS vars del tema para el layout del tenant. */
export function paletteVars(p: ClubPalette): Record<string, string> {
  return {
    "--brand-rgb": toTriplet(p.primary.base),
    "--brand-fg-rgb": toTriplet(p.primary.fg),
    "--brand-on-light-rgb": toTriplet(p.primary.onLight),
    "--brand-on-dark-rgb": toTriplet(p.primary.onDark),
    "--accent2-rgb": toTriplet(p.secondary.base),
    "--accent2-fg-rgb": toTriplet(p.secondary.fg),
    "--accent2-on-light-rgb": toTriplet(p.secondary.onLight),
    "--accent2-on-dark-rgb": toTriplet(p.secondary.onDark),
  };
}

/**
 * Iniciales del escudo cuando el club no tiene logo: las dos primeras palabras de
 * más de dos letras ("Club Atlético Norte" → "CA"; "Demo" → "D").
 */
export function clubInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const long = words.filter((w) => w.length > 2);
  return (long.length ? long : words)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "N";
}
