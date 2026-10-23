import type { Metadata } from "next";

import { PlatformConsole } from "@/components/onboarding/platform-console";

export const metadata: Metadata = {
  title: "Consola — Nutreitor",
  robots: { index: false },
};

/**
 * Consola de plataforma: sólo en el dominio raíz (la API rechaza subdominios). El
 * marco Estadio (acceso o consola) lo pone el propio componente según la sesión.
 */
export default function PlatformPage() {
  return <PlatformConsole />;
}
