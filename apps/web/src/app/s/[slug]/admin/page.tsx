import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

const SECTIONS = [
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
    <WorkspaceShell orgName={me.org.name} role={me.role}>
      <p className="text-xs font-medium uppercase tracking-widest text-brand">
        Administración
      </p>
      <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">Panel de {me.org.name}</h1>
      <p className="mt-4 text-stone-500">
        Hola {me.user.fullName}. Desde acá vas a administrar la organización:
        profesionales, pacientes, planes y configuración white-label.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
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
