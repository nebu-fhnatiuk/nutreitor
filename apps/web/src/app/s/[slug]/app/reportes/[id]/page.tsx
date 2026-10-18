import { redirect } from "next/navigation";
import { roleHome } from "@nutreitor/shared";

import { PortalReport } from "@/components/portal/portal-reports";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";

export default async function PatientReportPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "patient") redirect(roleHome[me.role]);
  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <PortalReport id={id} />
    </WorkspaceShell>
  );
}
