import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPassword } from "@/components/auth/forgot-password";
import { authBrand } from "@/lib/auth-brand";
import { fetchTenant } from "@/lib/server/api";

export const metadata: Metadata = { title: "Recuperar la contraseña", robots: { index: false } };

/** Recuperar la contraseña desde el subdominio de la org (ADR 0029), con la marca del club. */
export default async function TenantForgotPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <AuthShell brand={authBrand(await fetchTenant(slug), slug)}>
      <ForgotPassword backHref="/login" backLabel="Volver a ingresar" />
    </AuthShell>
  );
}
