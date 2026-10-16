import type { Metadata } from "next";
import { Fraunces, Figtree } from "next/font/google";
import type { ReactNode } from "react";

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
  return (
    <html lang="es-AR" className={`${serif.variable} ${sans.variable}`}>
      {/* El color de marca por defecto vive en globals.css; el del tenant lo
          sobrescribe app/s/[slug]/layout.tsx con su branding. */}
      <body>
        {children}
      </body>
    </html>
  );
}
