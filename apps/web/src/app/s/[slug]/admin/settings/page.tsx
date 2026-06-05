import { redirect } from "next/navigation";

import { BrandingForm } from "@/components/branding-form";
import { ModulesManager } from "@/components/admin/modules-manager";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe, fetchTenant } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(roleHome[me.role]);

  const branding = await fetchTenant(slug);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} userName={me.user.fullName}>
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Configuración</h1>
      <p className="mt-1 mb-8 text-sm text-stone-500">
        Branding white-label de la organización.
      </p>
      <BrandingForm initial={branding} />

      <h2 className="mt-12 font-serif text-xl font-semibold tracking-tight">Complementos</h2>
      <p className="mt-1 mb-6 text-sm text-stone-500">
        Funcionalidades opcionales que podés instalar para tu organización.
      </p>
      <ModulesManager />
    </WorkspaceShell>
  );
}
