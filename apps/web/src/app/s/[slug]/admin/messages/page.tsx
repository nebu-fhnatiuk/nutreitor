import { redirect } from "next/navigation";
import { workspaceHome } from "@nutreitor/shared";

import { Suspense } from "react";

import { Conversations } from "@/components/messages/conversations";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";

export default async function AdminMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug } = await params;
  const { c } = await searchParams;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(workspaceHome(me.role, me.org.kind));
  // Independiente (ADR 0026): una sola vista de trabajo, la de quien atiende.
  // Conserva `?c=` (los avisos del worker apuntan acá con la conversación).
  if (me.org.kind === "individual") redirect(c ? `/pro/messages?c=${encodeURIComponent(c)}` : "/pro/messages");
  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader title="Mensajes" description="Con cada profesional del consultorio. Las conversaciones con pacientes son privadas entre paciente y profesional." />
      <Suspense>
        <Conversations audience="admin" />
      </Suspense>
    </WorkspaceShell>
  );
}
