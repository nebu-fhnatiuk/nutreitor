import type { Config } from "tailwindcss";

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
