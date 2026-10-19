import { redirect } from "next/navigation";

import { PatientsList } from "@/components/patients/patients-list";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { actsAsProfessional, workspaceHome } from "@nutreitor/shared";

/** Lista completa de los pacientes a cargo del profesional. */
export default async function ProPatientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (!actsAsProfessional(me.role, me.org.kind)) redirect(workspaceHome(me.role, me.org.kind));

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader title="Pacientes" description="Los pacientes que tenés a cargo." />
      <PatientsList
        basePath="/pro/patients"
        // Independiente: da de alta sus pacientes (quedan asignados a ella).
        canCreate={me.role === "admin"}
        canAssign={false}
        initialSearch={q ?? ""}
      />
    </WorkspaceShell>
  );
}
