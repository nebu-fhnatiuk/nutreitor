import Link from "next/link";
import { redirect } from "next/navigation";

import { PatientsPanel } from "@/components/patients-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

export default async function ProPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "professional") redirect(roleHome[me.role]);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role}>
      <p className="text-xs font-medium uppercase tracking-widest text-brand">
        Profesional
      </p>
      <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">Tus pacientes</h1>
      <p className="mt-2 mb-6 text-stone-500">
        Hola {me.user.fullName}. Pacientes de {me.org.name} (aislados por RLS según
        tu sesión).
      </p>
      <Link
        href="/pro/profile"
        className="mb-8 inline-flex items-center gap-1 text-sm text-brand transition hover:brightness-110"
      >
        Editar mi perfil público →
      </Link>
      <PatientsPanel />
    </WorkspaceShell>
  );
}
