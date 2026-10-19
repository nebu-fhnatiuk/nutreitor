import { redirect } from "next/navigation";
import { actsAsProfessional, workspaceHome } from "@nutreitor/shared";

import { ContactInbox } from "@/components/contact/contact-inbox";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";

/** Solicitudes de contacto que le llegaron a quien atiende (ADR 0027). */
export default async function ProRequestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (!actsAsProfessional(me.role, me.org.kind)) redirect(workspaceHome(me.role, me.org.kind));

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader
        title="Solicitudes"
        description="Consultas que te dejaron en tu vidriera. Al aceptarlas creamos la ficha y le mandamos la invitación al portal."
      />
      <ContactInbox basePatientsPath="/pro/patients" team={false} />
    </WorkspaceShell>
  );
}
