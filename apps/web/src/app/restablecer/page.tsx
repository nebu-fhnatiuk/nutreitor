import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPassword } from "@/components/auth/reset-password";

export const metadata: Metadata = { title: "Contraseña nueva — Nutreitor", robots: { index: false } };

/** Elegir la contraseña nueva desde el dominio raíz (ADR 0029). */
export default async function RootResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <AuthShell>
      <ResetPassword token={token} loginBase="/plataforma" forgotHref="/olvide" />
    </AuthShell>
  );
}
