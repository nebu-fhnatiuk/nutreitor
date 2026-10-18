import { redirect } from "next/navigation";
import { roleHome } from "@nutreitor/shared";

import { Inbox } from "@/components/messages/inbox";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";

export default async function ProMessagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "professional") redirect(roleHome[me.role]);
  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <PageHeader title="Mensajes" description="Conversaciones con tus pacientes." />
      <Inbox patientBase="/pro/patients" />
    </WorkspaceShell>
  );
}
