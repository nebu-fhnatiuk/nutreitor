import { redirect } from "next/navigation";

import { ProfileEditor } from "@/components/pro/profile-editor";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe, fetchOwnProfile } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

export default async function ProProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "professional") redirect(roleHome[me.role]);

  const profile = await fetchOwnProfile(slug);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Mi perfil</h1>
      <p className="mt-1 mb-8 text-sm text-stone-500">
        Tu vidriera pública en {me.org.name}. Cada campo es privado por defecto:
        marcá “Público” lo que quieras mostrar.
      </p>
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
