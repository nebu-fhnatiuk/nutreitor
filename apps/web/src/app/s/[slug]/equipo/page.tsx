import { redirect } from "next/navigation";

import { TeamView } from "@/components/team/team-view";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { workspaceHome } from "@nutreitor/shared";

/** Tablero del cuerpo técnico (KAN-109): cómo vienen los jugadores de sus planteles. */
export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (!me.capabilities.includes("team:read")) redirect(workspaceHome(me.role, me.org.kind));

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <TeamView />
    </WorkspaceShell>
  );
}
