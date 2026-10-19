import { redirect } from "next/navigation";

import { MembersAdmin } from "@/components/members-admin";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { workspaceHome } from "@nutreitor/shared";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(workspaceHome(me.role, me.org.kind));
  // Independiente (ADR 0026): una sola vista de trabajo, la de quien atiende.
  if (me.org.kind === "individual") redirect("/admin/settings");

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <MembersAdmin capabilities={me.capabilities} />
    </WorkspaceShell>
  );
}
