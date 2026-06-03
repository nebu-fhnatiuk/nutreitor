import { redirect } from "next/navigation";

import { OrgPublicForm } from "@/components/admin/org-public-form";
import { RosterEditor } from "@/components/admin/roster-editor";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe, fetchRoster } from "@/lib/server/api";
import { fetchPublicOrg } from "@/lib/server/public-api";
import { roleHome } from "@nutreitor/shared";

export default async function AdminPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(roleHome[me.role]);

  const [org, roster] = await Promise.all([
    fetchPublicOrg(slug),
    fetchRoster(slug),
  ]);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role}>
      <h1 className="text-2xl font-bold tracking-tight">Página pública</h1>
      <p className="mt-1 mb-8 text-sm text-zinc-500">
        Lo que ven quienes llegan a {slug}.nutreitor.com antes de iniciar sesión.
      </p>

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-400">
          Presentación de la organización
        </h2>
        <OrgPublicForm
          initial={{
            publicHeadline: org?.publicHeadline ?? null,
            publicDescription: org?.publicDescription ?? null,
          }}
        />
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-zinc-400">
          Roster de profesionales
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Quién aparece y en qué orden. El contenido de cada perfil lo edita su
          dueño desde “Mi perfil”.
        </p>
        <RosterEditor initial={roster ?? []} />
      </section>
    </WorkspaceShell>
  );
}
