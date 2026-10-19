import { redirect } from "next/navigation";
import { actsAsProfessional, workspaceHome } from "@nutreitor/shared";

import { Suspense } from "react";

import { Conversations } from "@/components/messages/conversations";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";

export default async function ProMessagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (!actsAsProfessional(me.role, me.org.kind)) redirect(workspaceHome(me.role, me.org.kind));
  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader title="Mensajes" description={
          me.org.kind === "individual"
            ? "Con tus pacientes: sólo vos y cada paciente."
            : "Con tus pacientes (sólo vos y cada paciente) y con la administración."
        } />
      <Suspense>
        <Conversations audience="professional" solo={me.org.kind === "individual"} />
      </Suspense>
    </WorkspaceShell>
  );
}
