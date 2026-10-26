import { redirect } from "next/navigation";
import { workspaceHome } from "@nutreitor/shared";

import { PortalForm } from "@/components/portal/portal-forms";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";

/** Formulario previo a la consulta que pidió el profesional (KAN-60). */
export default async function PatientFormPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "patient") redirect(workspaceHome(me.role, me.org.kind));
  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader title="Antes de la consulta" description="Unas preguntas para que tu profesional llegue preparado." />
      <PortalForm id={id} />
    </WorkspaceShell>
  );
}
