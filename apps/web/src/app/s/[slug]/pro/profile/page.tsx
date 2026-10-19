import { redirect } from "next/navigation";

import { ProfileEditor } from "@/components/pro/profile-editor";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe, fetchOwnProfile } from "@/lib/server/api";
import { workspaceHome } from "@nutreitor/shared";

export default async function ProProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  // La admin también atiende (y en una org de una persona es la única que atiende).
  if (me.role === "patient") redirect(workspaceHome(me.role, me.org.kind));

  const profile = await fetchOwnProfile(slug);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader
        title="Mi perfil"
        description={`Tu vidriera pública en ${me.org.name}. Cada campo es privado por defecto: marcá “Público” lo que quieras mostrar.`}
      />
      {profile ? (
        <ProfileEditor initial={profile} />
      ) : (
        <p className="text-sm text-stone-500">
          No encontramos tu perfil en esta organización.
        </p>
      )}
    </WorkspaceShell>
  );
}
