import { redirect } from "next/navigation";

import { PortalView } from "@/components/portal/portal-view";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

export default async function PatientAppPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "patient") redirect(roleHome[me.role]);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role}>
      <p className="text-xs font-medium uppercase tracking-widest text-brand">
        Tu espacio
      </p>
      <h1 className="mt-1 mb-8 font-serif text-3xl font-semibold tracking-tight">
        Hola {me.user.fullName}
      </h1>
      <PortalView />
    </WorkspaceShell>
  );
}
