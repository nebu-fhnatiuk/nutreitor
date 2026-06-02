import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";

import { getTenantTheme } from "@/lib/tenant-theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nutreitor",
  description: "Plataforma de captación y seguimiento de pacientes (nutrición).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // STUB: el tenant se resolverá por subdominio/host. Acá inyectamos su tema
  // como CSS variables, que es lo que consume Tailwind (color `brand`).
  const theme = getTenantTheme();

  return (
    <html lang="es-AR">
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
