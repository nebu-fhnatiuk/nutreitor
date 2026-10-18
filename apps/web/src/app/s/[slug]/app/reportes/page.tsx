import { redirect } from "next/navigation";
import { roleHome } from "@nutreitor/shared";

import { PortalReportsList } from "@/components/portal/portal-reports";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";

export default async function PatientReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "patient") redirect(roleHome[me.role]);
  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <PageHeader title="Tus reportes" description="El resumen de cada mes que publica tu profesional." />
      <PortalReportsList />
    </WorkspaceShell>
  );
}
