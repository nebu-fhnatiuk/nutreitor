import { redirect } from "next/navigation";

import { GroupsView } from "@/components/groups/groups-view";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { workspaceHome } from "@nutreitor/shared";

/** Grupos de la organización: la admin los arma; cada profesional ve a sus asignados. */
export default async function AdminGroupsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(workspaceHome(me.role, me.org.kind));
  if (me.org.kind === "individual") redirect("/pro/groups");

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader
        title="Grupos"
        description="Planteles, divisiones o turnos. Cada profesional ve en el grupo sólo a los deportistas que tiene asignados."
      />
      <GroupsView basePath="/admin/groups" canManage />
    </WorkspaceShell>
  );
}
