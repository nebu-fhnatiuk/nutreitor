import { redirect } from "next/navigation";

import { GroupDetail } from "@/components/groups/group-detail";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { workspaceHome } from "@nutreitor/shared";

export default async function AdminGroupPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(workspaceHome(me.role, me.org.kind));
  if (me.org.kind === "individual") redirect(`/pro/groups/${id}`);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <GroupDetail id={id} basePath="/admin/groups" patientsPath="/admin/patients" canManage canRecord />
    </WorkspaceShell>
  );
}
