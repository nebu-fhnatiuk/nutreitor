import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPassword } from "@/components/auth/reset-password";
import { authBrand } from "@/lib/auth-brand";
import { fetchTenant } from "@/lib/server/api";

export const metadata: Metadata = { title: "Contraseña nueva", robots: { index: false } };

/** Elegir la contraseña nueva desde el link del mail, en el subdominio (ADR 0029). */
export default async function TenantResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ slug }, { token = "" }] = await Promise.all([params, searchParams]);
  return (
    <AuthShell brand={authBrand(await fetchTenant(slug), slug)}>
      <ResetPassword token={token} loginBase="/login" forgotHref="/olvide" />
    </AuthShell>
  );
}
