import { redirect } from "next/navigation";

import { PatientDetail } from "@/components/patients/patient-detail";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

export default async function ProPatientPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "professional") redirect(roleHome[me.role]);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <PatientDetail
        id={id}
        basePath="/pro"
        canEdit
        canAddNote
        canRecord
        canWritePlan
        canEditVisibility
        canAssign={false}
        canInvite={false}
      />
    </WorkspaceShell>
  );
}
