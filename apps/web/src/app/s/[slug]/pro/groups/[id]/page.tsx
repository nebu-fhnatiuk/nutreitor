import { redirect } from "next/navigation";

import { GroupDetail } from "@/components/groups/group-detail";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { actsAsProfessional, workspaceHome } from "@nutreitor/shared";

export default async function ProGroupPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (!actsAsProfessional(me.role, me.org.kind)) redirect(workspaceHome(me.role, me.org.kind));

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <GroupDetail id={id} basePath="/pro/groups" patientsPath="/pro/patients" canManage={me.role === "admin"} canRecord />
    </WorkspaceShell>
  );
}
