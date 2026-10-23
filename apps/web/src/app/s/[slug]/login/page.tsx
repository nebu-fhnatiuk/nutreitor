import { redirect } from "next/navigation";

import { AuthHeading, AuthNotice, AuthShell } from "@/components/auth/auth-shell";
import { authBrand } from "@/lib/auth-brand";
import { fetchMe, fetchTenant } from "@/lib/server/api";
import { workspaceHome } from "@nutreitor/shared";
import { LoginForm } from "./login-form";

/**
 * Login con la identidad del club (KAN-77): escudo, nombre y colores del tenant.
 * Si ya hay sesión válida, redirige al dashboard del rol.
 */
export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ email?: string; nueva?: string; restablecida?: string }>;
}) {
  const { slug } = await params;
  const { email, nueva, restablecida } = await searchParams;
  const me = await fetchMe(slug);
  if (me) redirect(workspaceHome(me.role, me.org.kind));

  const brand = authBrand(await fetchTenant(slug), slug);

  return (
    <AuthShell brand={brand}>
      <AuthHeading kicker="Tu espacio del club" title="Ingresá" />
      <div className="mt-7 space-y-4">
        {nueva === "1" && (
          <AuthNotice zone="ok" title={`¡Listo! Creamos ${brand.name}.`} live="status">
            Ingresá para configurarlo mientras revisamos el alta.
          </AuthNotice>
        )}
        {restablecida === "1" && (
          <AuthNotice zone="ok" title="Guardamos tu contraseña nueva." live="status">
            Ingresá con ella.
          </AuthNotice>
        )}
        <LoginForm initialEmail={email} />
      </div>
    </AuthShell>
  );
}
