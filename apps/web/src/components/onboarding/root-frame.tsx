import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

/**
 * Marco de las páginas del dominio raíz que viven en la app (alta, consola). Misma
 * estética que la landing de `apps/site` (dirección A, ADR 0028): Manrope, base fría
 * y clara, acento verde azulado. Sin branding de tenant.
 */
const manrope = Manrope({ subsets: ["latin"], display: "swap" });

export function RootFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={`${manrope.className} min-h-screen bg-[#F6F9F9] text-[#0E1F24]`}
      // El acento de la landing manda sobre el verde por defecto de la app.
      style={{ ["--brand-rgb" as string]: "15 118 110" }}
    >
      <header className="border-b border-[#E3ECEC] bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-4 sm:px-6">
          <a href="/" className="flex min-h-11 items-center gap-2.5" aria-label="Nutreitor, inicio">
            <span className="inline-block h-7 w-7 rounded-lg bg-[#0F766E]" aria-hidden />
            <span className="text-xl font-extrabold tracking-tight">nutreitor</span>
          </a>
        </div>
      </header>
      <main className={`mx-auto px-4 py-10 sm:px-6 sm:py-14 ${wide ? "max-w-6xl" : "max-w-xl"}`}>
        {children}
      </main>
    </div>
  );
}
