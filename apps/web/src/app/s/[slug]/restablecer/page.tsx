import type { Metadata } from "next";

import { ResetPassword } from "@/components/auth/reset-password";
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
  const org = await fetchTenant(slug);
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_12px_rgb(var(--brand-rgb))]" />
          <span className="text-lg font-semibold tracking-tight">{org?.name ?? slug}</span>
        </div>
        <ResetPassword token={token} loginBase="/login" forgotHref="/olvide" />
      </div>
    </main>
  );
}
