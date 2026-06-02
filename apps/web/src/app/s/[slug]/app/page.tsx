import { redirect } from "next/navigation";

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
    <WorkspaceShell orgName={me.org.name} role={me.role}>
      <p className="text-xs font-medium uppercase tracking-widest text-brand">
        Paciente
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">
        Hola {me.user.fullName}
      </h1>
      <p className="mt-4 text-zinc-400">
        Tu espacio en {me.org.name}: vas a ver tus planes diarios, horarios de
        comidas, progreso y métricas.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {["Plan de hoy", "Progreso", "Próxima cita"].map((s) => (
          <div
            key={s}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-zinc-300"
          >
            {s}
            <p className="mt-1 text-xs text-zinc-600">Próximamente</p>
          </div>
        ))}
      </div>
    </WorkspaceShell>
  );
}
