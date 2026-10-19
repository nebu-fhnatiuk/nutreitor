import { redirect } from "next/navigation";
import { workspaceHome } from "@nutreitor/shared";

import { ContactInbox } from "@/components/contact/contact-inbox";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";

/**
 * Solicitudes para el consultorio (y las que le escribieron a la admin si atiende).
 * Las que le escribieron a un profesional las ve sólo él (ADR 0027).
 */
export default async function AdminRequestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(workspaceHome(me.role, me.org.kind));
  // Independiente (ADR 0026): una sola vista de trabajo, la de quien atiende.
  if (me.org.kind === "individual") redirect("/pro/requests");

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader
        title="Solicitudes"
        description="Consultas al consultorio desde la vidriera: asignalas a un profesional o derivalas. Las que le escriben a un profesional las ve sólo él."
      />
      <ContactInbox basePatientsPath="/admin/patients" team />
    </WorkspaceShell>
  );
}
