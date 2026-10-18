import { redirect } from "next/navigation";

import { AdminOverview } from "@/components/admin/overview";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(roleHome[me.role]);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <PageHeader
        title={`Panel de ${me.org.name}`}
        description={`Hola, ${me.user.fullName.split(" ")[0]}. Desde acá administrás el equipo, los pacientes y cómo se ve tu organización.`}
      />
      <AdminOverview />
    </WorkspaceShell>
  );
}
