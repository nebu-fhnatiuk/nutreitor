import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPassword } from "@/components/auth/forgot-password";

export const metadata: Metadata = { title: "Recuperar la contraseña — Nutreitor", robots: { index: false } };

/** Recuperar la contraseña desde el dominio raíz (consola de plataforma, ADR 0029). */
export default function RootForgotPage() {
  return (
    <AuthShell>
      <ForgotPassword backHref="/plataforma" backLabel="Volver" />
    </AuthShell>
  );
}
