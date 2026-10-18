import { redirect } from "next/navigation";
import { roleHome } from "@nutreitor/shared";

import { Suspense } from "react";

import { Conversations } from "@/components/messages/conversations";
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
      <Suspense>
        <Conversations audience="patient" />
      </Suspense>
    </WorkspaceShell>
  );
}
