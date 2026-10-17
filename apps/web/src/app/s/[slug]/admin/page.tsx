import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

const SECTIONS = [
  {
    href: "/admin/patients",
    title: "Pacientes",
    desc: "Fichas clínicas, asignaciones y notas.",
  },
  { href: "/admin/members", title: "Miembros", desc: "Invitar, roles y bajas." },
  {
    href: "/admin/public",
    title: "Página pública",
    desc: "Presentación de la org y curaduría del roster.",
  },
  { href: "/admin/settings", title: "Configuración", desc: "Branding white-label." },
];

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
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-2xl border border-stone-200 bg-white p-6 transition hover:border-brand/50 hover:bg-stone-100"
          >
            <div className="font-semibold text-stone-900">{s.title}</div>
            <p className="mt-1 text-sm text-stone-500">{s.desc}</p>
          </Link>
        ))}
      </div>
    </WorkspaceShell>
  );
}
