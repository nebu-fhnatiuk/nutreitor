import { redirect } from "next/navigation";

import { GroupAnthropometrySheet } from "@/components/groups/group-anthropometry-sheet";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { workspaceHome } from "@nutreitor/shared";

export default async function AdminGroupMeasurePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(workspaceHome(me.role, me.org.kind));
  if (me.org.kind === "individual") redirect(`/pro/groups/${id}/medir`);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <GroupAnthropometrySheet id={id} basePath="/admin/groups" />
    </WorkspaceShell>
  );
}
