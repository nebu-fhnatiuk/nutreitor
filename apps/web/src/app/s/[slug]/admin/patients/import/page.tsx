import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PatientImport } from "@/components/patients/patient-import";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { workspaceHome } from "@nutreitor/shared";

export const metadata: Metadata = { title: "Importar deportistas — Nutreitor" };

/** Alta masiva desde un CSV (KAN-42). La admin del equipo o la profesional independiente. */
export default async function ImportPatientsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(workspaceHome(me.role, me.org.kind));
  // Independiente (ADR 0026): su listado vive en /pro/patients.
  const backHref = me.org.kind === "individual" ? "/pro/patients" : "/admin/patients";

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader
        title="Importar deportistas"
        description="Sumá a todo el plantel de una vez: subí el archivo, revisá la vista previa y confirmá."
      />
      <PatientImport backHref={backHref} orgActive={me.org.status === "active"} />
    </WorkspaceShell>
  );
}
