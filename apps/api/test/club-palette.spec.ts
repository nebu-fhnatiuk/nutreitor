import { AA, SURFACE_DARK, SURFACE_LIGHT, clubPalette, contrast, paletteVars, parseHex, toHex } from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/** Colores del club (KAN-69): contraste WCAG 2.1 y ajuste a AA. */
const rgb = (h: string) => parseHex(h)!;

describe("contraste WCAG", () => {
  it("valores de referencia", () => {
    expect(contrast(rgb("#000000"), rgb("#FFFFFF"))).toBeCloseTo(21, 5);
    expect(contrast(rgb("#FFFFFF"), rgb("#FFFFFF"))).toBe(1);
    // #767676 es el gris más claro que pasa AA sobre blanco; #777777 ya no.
    expect(contrast(rgb("#767676"), rgb("#FFFFFF"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb("#777777"), rgb("#FFFFFF"))).toBeLessThan(4.5);
  });

  it("parseHex acepta con y sin #, y rechaza lo inválido", () => {
    expect(parseHex("f28c28")).toEqual([242, 140, 40]);
    expect(parseHex("#F28C28")).toEqual([242, 140, 40]);
    expect(parseHex("#FFF")).toBeNull();
    expect(parseHex(null)).toBeNull();
  });
});

describe("paleta del club", () => {
  it("sin colores usa los de Nutreitor", () => {
    const p = clubPalette(null, null);
    expect(toHex(p.primary.base)).toBe("#107A57");
    expect(toHex(p.secondary.base)).toBe("#F28C28");
  });

  it("amarillo: texto oscuro encima y un tono más oscuro para usarlo como texto sobre blanco", () => {
    const p = clubPalette("#F5C518", "#1E3A8A");
    expect(toHex(p.primary.fg)).not.toBe("#FFFFFF");
    expect(contrast(p.primary.onLight, SURFACE_LIGHT)).toBeGreaterThanOrEqual(AA);
    expect(toHex(p.primary.onDark)).toBe("#F5C518"); // sobre oscuro ya alcanza
    expect(p.checks.find((c) => c.label === "Color principal como texto (claro)")).toMatchObject({ ok: true, adjusted: true });
  });

  it("azul marino: texto blanco encima y un tono más claro para usarlo como texto sobre oscuro", () => {
    const p = clubPalette("#1E3A8A", "#F5C518");
    expect(toHex(p.primary.fg)).toBe("#FFFFFF");
    expect(toHex(p.primary.onLight)).toBe("#1E3A8A");
    expect(contrast(p.primary.onDark, SURFACE_DARK)).toBeGreaterThanOrEqual(AA);
    expect(p.checks.every((c) => c.ok)).toBe(true);
  });

  it("avisa si los dos colores casi no se distinguen", () => {
    expect(clubPalette("#1E3A8A", "#1F3B8C").tooSimilar).toBe(true);
    expect(clubPalette("#1E3A8A", "#F5C518").tooSimilar).toBe(false);
  });

  it("las CSS vars del tema van como triplete r g b", () => {
    expect(paletteVars(clubPalette("#1E3A8A", "#F5C518"))).toMatchObject({
      "--brand-rgb": "30 58 138",
      "--accent2-rgb": "245 197 24",
      "--brand-fg-rgb": "255 255 255",
    });
  });
});
