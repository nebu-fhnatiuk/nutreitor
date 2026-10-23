import type { Config } from "tailwindcss";

/**
 * Escalas que el tema Estadio invierte en oscuro (ver globals.css). Cada tono lee
 * su CSS var, así las ~900 clases `stone-*` existentes cambian de tema sin tocar
 * los componentes. En claro, los valores son idénticos a la paleta de Tailwind.
 */
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
function varScale(name: string) {
  return Object.fromEntries(SHADES.map((n) => [n, `rgb(var(--${name}-${n}) / <alpha-value>)`]));
}

/**
 * Tailwind. Los colores de marca se exponen como CSS variables (ver globals.css
 * y lib/tenant-theme), de modo que el white-label por organización pueda
 * sobrescribirlos en runtime sin recompilar.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "rgb(var(--brand-rgb) / <alpha-value>)",
          fg: "rgb(var(--brand-fg-rgb) / <alpha-value>)",
        },
        // Segundo color del club (camiseta alterna): acentos de transmisión.
        accent2: {
          DEFAULT: "rgb(var(--accent2-rgb) / <alpha-value>)",
          fg: "rgb(var(--accent2-fg-rgb) / <alpha-value>)",
        },
        // Superficie de tarjetas/paneles (blanco en claro, grafito en oscuro).
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        // Zonas: dentro del rango, en el límite, fuera. Siempre con texto/forma al lado.
        zone: {
          ok: "rgb(var(--zone-ok-rgb) / <alpha-value>)",
          warn: "rgb(var(--zone-warn-rgb) / <alpha-value>)",
          bad: "rgb(var(--zone-bad-rgb) / <alpha-value>)",
        },
        stone: varScale("stone"),
        red: varScale("red"),
        amber: varScale("amber"),
        emerald: varScale("emerald"),
        sky: varScale("sky"),
        // Marca DE PRODUCTO (landing nutreitor.com). Estáticos a propósito: son la
        // identidad de Nutreitor-el-producto, no el `brand` var-driven del
        // white-label por tenant. Dirección "editorial cálido".
        cream: "#FAF7F1", // lienzo cálido
        ink: "#1C1B17", // tinta casi-negra cálida
        clay: {
          DEFAULT: "#C9603A", // acento terracota (calidez / humano / deporte)
          soft: "#E5A684",
        },
      },
      fontFamily: {
        // Display editorial (serif) + UI (sans). Cargadas con next/font en el layout.
        serif: ["var(--font-serif)", "Georgia", "ui-serif", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Condensada de marcador: cifras grandes y rótulos (tema Estadio).
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        // Reveal sutil en el load (enhancement; el contenido ya está en el DOM
        // para indexación, y prefers-reduced-motion lo desactiva en globals).
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "rise-in": "rise-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
