import { redirect } from "next/navigation";

import { PortalShopping } from "@/components/portal/portal-shopping";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

/** Lista de compras del paciente (imprimible). */
export default async function PatientShoppingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "patient") redirect(roleHome[me.role]);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <PortalShopping />
    </WorkspaceShell>
  );
}
