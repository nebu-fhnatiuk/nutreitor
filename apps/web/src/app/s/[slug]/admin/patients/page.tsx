import { redirect } from "next/navigation";

import { PatientsList } from "@/components/patients/patients-list";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

export default async function AdminPatientsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(roleHome[me.role]);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <PageHeader
        title="Pacientes"
        description={`Todos los pacientes de ${me.org.name}. Podés crear, asignar profesionales y ver la ficha.`}
      />
      <PatientsList basePath="/admin/patients" canCreate canAssign />
    </WorkspaceShell>
  );
}
