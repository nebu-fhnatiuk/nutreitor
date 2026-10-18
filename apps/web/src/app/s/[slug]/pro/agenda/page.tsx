import { redirect } from "next/navigation";

import { Agenda } from "@/components/scheduling/agenda";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

export default async function ProAgendaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  // La admin también atiende (y en una org de una persona es la única que atiende).
  if (me.role === "patient") redirect(roleHome[me.role]);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <Agenda />
    </WorkspaceShell>
  );
}
