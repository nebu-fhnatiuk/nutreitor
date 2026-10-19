import { redirect } from "next/navigation";

import { OnboardingChecklist } from "@/components/admin/onboarding-checklist";
import { AdminOverview } from "@/components/admin/overview";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { workspaceHome } from "@nutreitor/shared";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(workspaceHome(me.role, me.org.kind));
  // Independiente (ADR 0026): una sola vista de trabajo, la de quien atiende.
  if (me.org.kind === "individual") redirect("/pro");

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader
        title={`Panel de ${me.org.name}`}
        description={`Hola, ${me.user.fullName.split(" ")[0]}. Desde acá administrás el equipo, los pacientes y cómo se ve tu organización.`}
      />
      <div className="space-y-6">
        <OnboardingChecklist />
        <AdminOverview />
      </div>
    </WorkspaceShell>
  );
}
