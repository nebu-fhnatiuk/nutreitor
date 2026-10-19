import { redirect } from "next/navigation";
import { workspaceHome } from "@nutreitor/shared";

import { PortalReport } from "@/components/portal/portal-reports";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";

export default async function PatientReportPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "patient") redirect(workspaceHome(me.role, me.org.kind));
  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PortalReport id={id} />
    </WorkspaceShell>
  );
}
