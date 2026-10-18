import type { Metadata } from "next";

import { PlatformConsole } from "@/components/onboarding/platform-console";
import { RootFrame } from "@/components/onboarding/root-frame";

export const metadata: Metadata = {
  title: "Consola — Nutreitor",
  robots: { index: false },
};

/** Consola de plataforma: sólo en el dominio raíz (la API rechaza subdominios). */
export default function PlatformPage() {
  return (
    <RootFrame wide>
      <PlatformConsole />
    </RootFrame>
  );
}
