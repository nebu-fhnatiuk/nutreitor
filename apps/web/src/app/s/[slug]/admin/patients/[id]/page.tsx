import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PatientDetail } from "@/components/patients/patient-detail";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

export default async function AdminPatientPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(roleHome[me.role]);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <Suspense>
        <PatientDetail
          id={id}
          basePath="/admin/patients"
          canEdit
          canAddNote
          canRecord
          canWritePlan
          canEditVisibility
          canUseAgent={me.modules.includes("agents")}
          canAssign
          canInvite
        />
      </Suspense>
    </WorkspaceShell>
  );
}
