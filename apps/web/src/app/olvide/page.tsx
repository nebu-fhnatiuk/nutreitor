import type { Metadata } from "next";

import { ForgotPassword } from "@/components/auth/forgot-password";
import { RootFrame } from "@/components/onboarding/root-frame";

export const metadata: Metadata = { title: "Recuperar la contraseña — Nutreitor", robots: { index: false } };

/** Recuperar la contraseña desde el dominio raíz (consola de plataforma, ADR 0029). */
export default function RootForgotPage() {
  return (
    <RootFrame>
      <div className="mx-auto max-w-sm">
        <ForgotPassword backHref="/plataforma" backLabel="Volver" />
      </div>
    </RootFrame>
  );
}
