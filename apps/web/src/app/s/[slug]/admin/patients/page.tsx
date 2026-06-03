import { redirect } from "next/navigation";

import { PatientsList } from "@/components/patients/patients-list";
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
    <WorkspaceShell orgName={me.org.name} role={me.role}>
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Pacientes</h1>
      <p className="mt-1 mb-8 text-sm text-stone-500">
        Todos los pacientes de {me.org.name}. Podés crear, asignar profesionales y
        ver la ficha.
      </p>
      <PatientsList basePath="/admin/patients" canCreate canAssign />
    </WorkspaceShell>
  );
}
