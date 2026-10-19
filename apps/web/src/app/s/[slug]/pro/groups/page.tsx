import { redirect } from "next/navigation";

import { GroupsView } from "@/components/groups/groups-view";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { actsAsProfessional, workspaceHome } from "@nutreitor/shared";

/** Grupos (planteles, divisiones, turnos) con los deportistas a cargo. */
export default async function ProGroupsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (!actsAsProfessional(me.role, me.org.kind)) redirect(workspaceHome(me.role, me.org.kind));

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader title="Grupos" description="Planteles, divisiones o turnos: para medir y seguir a todo el grupo junto." />
      {/* Independiente: arma sus propios grupos (en un equipo lo hace la admin). */}
      <GroupsView basePath="/pro/groups" canManage={me.role === "admin"} />
    </WorkspaceShell>
  );
}
