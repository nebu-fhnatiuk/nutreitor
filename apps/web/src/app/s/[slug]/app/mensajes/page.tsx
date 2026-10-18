import { redirect } from "next/navigation";
import { roleHome } from "@nutreitor/shared";

import { ChatThread } from "@/components/messages/chat-thread";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";

export default async function PatientMessagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "patient") redirect(roleHome[me.role]);
  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <PageHeader title="Mensajes" description="Escribile a tu profesional. No es un canal de urgencias." />
      <ChatThread
        endpoint="portal/me/messages"
        emptyText="Todavía no hay mensajes. Escribí tu consulta y tu profesional te responde por acá."
        blockedText="Vas a poder escribir cuando tengas un profesional asignado."
      />
    </WorkspaceShell>
  );
}
