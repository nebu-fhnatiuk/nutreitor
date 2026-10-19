import { redirect } from "next/navigation";

import { AccountKind } from "@/components/admin/account-kind";
import { BrandingForm } from "@/components/branding-form";
import { ModulesManager } from "@/components/admin/modules-manager";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe, fetchTenant } from "@/lib/server/api";
import { workspaceHome } from "@nutreitor/shared";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(workspaceHome(me.role, me.org.kind));

  const branding = await fetchTenant(slug);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader
        title="Configuración"
        description="Tipo de cuenta, colores y logo, y los complementos instalados."
      />
      <h2 className="mb-3 font-serif text-xl font-semibold tracking-tight">Tipo de cuenta</h2>
      <AccountKind kind={me.org.kind} />

      <h2 className="mt-12 mb-3 font-serif text-xl font-semibold tracking-tight">Marca</h2>
      <BrandingForm initial={branding} />

      <h2 className="mt-12 font-serif text-xl font-semibold tracking-tight">Complementos</h2>
      <p className="mt-1 mb-6 text-sm text-stone-500">
        Funcionalidades opcionales que podés instalar para tu organización.
      </p>
      <ModulesManager />
    </WorkspaceShell>
  );
}
