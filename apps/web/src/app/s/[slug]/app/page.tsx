import { redirect } from "next/navigation";

import { PortalView } from "@/components/portal/portal-view";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

export default async function PatientAppPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "patient") redirect(roleHome[me.role]);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <PageHeader title={`Hola, ${me.user.fullName.split(" ")[0]}`} />
      <InstallPrompt appName={me.org.name} className="mb-6" />
      <PortalView />
    </WorkspaceShell>
  );
}
