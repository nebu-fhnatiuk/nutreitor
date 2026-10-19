import { redirect } from "next/navigation";

import { Recipes } from "@/components/pro/recipes";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { actsAsProfessional, workspaceHome } from "@nutreitor/shared";

/** Recetas del profesional: las suyas y la biblioteca común (ADR 0019). */
export default async function ProRecipesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (!actsAsProfessional(me.role, me.org.kind)) redirect(workspaceHome(me.role, me.org.kind));

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader
        title="Recetas"
        description="Armalas una vez y usalas en todos tus planes: en el editor aparecen como “1 porción” con sus macros calculados."
      />
      <Recipes />
    </WorkspaceShell>
  );
}
