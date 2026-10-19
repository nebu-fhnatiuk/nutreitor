import type { Metadata } from "next";

import { ResetPassword } from "@/components/auth/reset-password";
import { RootFrame } from "@/components/onboarding/root-frame";

export const metadata: Metadata = { title: "Contraseña nueva — Nutreitor", robots: { index: false } };

/** Elegir la contraseña nueva desde el dominio raíz (ADR 0029). */
export default async function RootResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <RootFrame>
      <div className="mx-auto max-w-sm">
        <ResetPassword token={token} loginBase="/plataforma" forgotHref="/olvide" />
      </div>
    </RootFrame>
  );
}
