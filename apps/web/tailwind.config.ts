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
      },
    },
  },
  plugins: [],
};

export default config;
