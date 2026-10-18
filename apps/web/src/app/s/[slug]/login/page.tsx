import { redirect } from "next/navigation";

import { fetchMe, fetchTenant } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";
import { LoginForm } from "./login-form";

/**
 * Login brandeado por organización. Si ya hay sesión válida, redirige al
 * dashboard del rol. El branding (nombre/colores) sale de la config del tenant
 * (placeholder de colores por ahora).
 */
export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ email?: string; nueva?: string }>;
}) {
  const { slug } = await params;
  const { email, nueva } = await searchParams;
  const me = await fetchMe(slug);
  if (me) redirect(roleHome[me.role]);

  const org = await fetchTenant(slug);
  const orgName = org?.name ?? slug;

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_12px_rgb(var(--brand-rgb))]" />
          <span className="text-lg font-semibold tracking-tight">{orgName}</span>
        </div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Ingresá a tu cuenta</h1>
        <p className="mt-1 text-sm text-stone-500">
          Workspace de <span className="text-stone-700">{orgName}</span>
        </p>
        {nueva === "1" && (
          <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            ¡Listo! Creamos {orgName}. Ingresá para configurarla mientras revisamos el alta.
          </p>
        )}
        <div className="mt-8">
          <LoginForm initialEmail={email} />
        </div>
      </div>
    </main>
  );
}
