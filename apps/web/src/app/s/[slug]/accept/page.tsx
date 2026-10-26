import { AcceptInvite } from "@/components/accept-invite";
import { AuthShell } from "@/components/auth/auth-shell";
import { authBrand } from "@/lib/auth-brand";
import { fetchTenant } from "@/lib/server/api";

/**
 * Página pública de aceptación de invitación, con la marca del club (KAN-77). Los
 * colores los aplica el layout de `s/[slug]`. El token llega por query (?token=).
 * `next` lleva al deportista directo a un formulario pedido (KAN-90); sólo se acepta
 * esa ruta, para no abrir un redirect a cualquier lado.
 */
const NEXT_ALLOWED = /^\/app\/formularios\/[0-9a-f-]{36}$/;

export default async function AcceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const [{ slug }, { token, next }] = await Promise.all([params, searchParams]);
  return (
    <AuthShell brand={authBrand(await fetchTenant(slug), slug)}>
      <AcceptInvite token={token ?? ""} next={next && NEXT_ALLOWED.test(next) ? next : undefined} />
    </AuthShell>
  );
}
