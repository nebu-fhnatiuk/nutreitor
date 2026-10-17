import { redirect } from "next/navigation";

import { PatientsList } from "@/components/patients/patients-list";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

export default async function ProPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "professional") redirect(roleHome[me.role]);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <PageHeader
        title="Tus pacientes"
        description={`Hola, ${me.user.fullName.split(" ")[0]}. Estos son los pacientes que tenés a cargo.`}
      />
      <PatientsList basePath="/pro/patients" canCreate={false} canAssign={false} />
    </WorkspaceShell>
  );
}
