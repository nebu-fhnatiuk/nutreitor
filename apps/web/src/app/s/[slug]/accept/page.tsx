import { AcceptInvite } from "@/components/accept-invite";

/**
 * Página pública de aceptación de invitación. El branding del tenant lo aplica el
 * layout de `s/[slug]`. El token llega por query (?token=).
 */
export default async function AcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <AcceptInvite token={token ?? ""} />
    </main>
  );
}
