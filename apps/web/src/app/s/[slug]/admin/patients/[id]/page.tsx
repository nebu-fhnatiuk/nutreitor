import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PatientDetail } from "@/components/patients/patient-detail";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { workspaceHome } from "@nutreitor/shared";

export default async function AdminPatientPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(workspaceHome(me.role, me.org.kind));
  // Independiente (ADR 0026): una sola vista de trabajo, la de quien atiende.
  if (me.org.kind === "individual") redirect(`/pro/patients/${id}`);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
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
