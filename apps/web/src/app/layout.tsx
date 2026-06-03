import type { Metadata } from "next";
import { Fraunces, Figtree } from "next/font/google";
import type { CSSProperties, ReactNode } from "react";

import { getTenantTheme } from "@/lib/tenant-theme";
import "./globals.css";

// Hilo conductor tipográfico: display serif editorial + UI sans humanista.
const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  axes: ["opsz"],
});
const sans = Figtree({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nutreitor",
  description: "Plataforma de captación y seguimiento de pacientes (nutrición).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // STUB: el tenant se resolverá por subdominio/host. Acá inyectamos su tema
  // como CSS variables, que es lo que consume Tailwind (color `brand`).
  const theme = getTenantTheme();

  return (
    <html lang="es-AR" className={`${serif.variable} ${sans.variable}`}>
      <body
        style={
          {
            "--brand-rgb": theme.brandRgb,
            "--brand-fg-rgb": theme.brandFgRgb,
          } as CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
