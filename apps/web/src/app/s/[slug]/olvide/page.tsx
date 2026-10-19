import type { Metadata } from "next";

import { ForgotPassword } from "@/components/auth/forgot-password";
import { fetchTenant } from "@/lib/server/api";

export const metadata: Metadata = { title: "Recuperar la contraseña", robots: { index: false } };

/** Recuperar la contraseña desde el subdominio de la org (ADR 0029). */
export default async function TenantForgotPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await fetchTenant(slug);
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_12px_rgb(var(--brand-rgb))]" />
          <span className="text-lg font-semibold tracking-tight">{org?.name ?? slug}</span>
        </div>
        <ForgotPassword backHref="/login" backLabel="Volver a ingresar" />
      </div>
    </main>
  );
}
