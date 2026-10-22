import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, Fraunces, Figtree } from "next/font/google";
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

// Tema Estadio (workspace): UI Barlow + cifras/rótulos en Barlow Condensed.
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});
const condensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-condensed",
  display: "swap",
});

/**
 * Preferencia claro/oscuro del workspace, aplicada antes del primer pintado para
 * no parpadear (el tema Estadio es oscuro por defecto; ver ThemeToggle).
 */
const MODE_SCRIPT = `try{if(localStorage.getItem("nutreitor-mode")==="light")document.documentElement.dataset.mode="light"}catch(e){}`;

export const metadata: Metadata = {
  title: "Nutreitor",
  description: "Plataforma de captación y seguimiento de pacientes (nutrición).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es-AR"
      className={`${serif.variable} ${sans.variable} ${barlow.variable} ${condensed.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_SCRIPT }} />
      </head>
      {/* El color de marca por defecto vive en globals.css; el del tenant lo
          sobrescribe app/s/[slug]/layout.tsx con su branding. */}
      <body>
        {children}
      </body>
    </html>
  );
}
