import { AcceptInvite } from "@/components/accept-invite";
import { AuthShell } from "@/components/auth/auth-shell";
import { authBrand } from "@/lib/auth-brand";
import { fetchTenant } from "@/lib/server/api";

/**
 * Página pública de aceptación de invitación, con la marca del club (KAN-77). Los
 * colores los aplica el layout de `s/[slug]`. El token llega por query (?token=).
 */
export default async function AcceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ slug }, { token }] = await Promise.all([params, searchParams]);
  return (
    <AuthShell brand={authBrand(await fetchTenant(slug), slug)}>
      <AcceptInvite token={token ?? ""} />
    </AuthShell>
  );
}
