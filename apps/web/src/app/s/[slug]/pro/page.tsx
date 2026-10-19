import { redirect } from "next/navigation";

import { OnboardingChecklist } from "@/components/admin/onboarding-checklist";
import { ProToday } from "@/components/pro/today";
import { PageHeader } from "@/components/ui";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fetchMe } from "@/lib/server/api";
import { actsAsProfessional, workspaceHome } from "@nutreitor/shared";

/** Inicio del profesional: el día de hoy (turnos + pacientes). */
export default async function ProPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  if (!me) redirect("/login");
  if (!actsAsProfessional(me.role, me.org.kind)) redirect(workspaceHome(me.role, me.org.kind));

  const longDate = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  // Sólo la primera letra ("Sábado, 17 de octubre"): `capitalize` de CSS haría "De".
  const today = longDate.charAt(0).toUpperCase() + longDate.slice(1);

  return (
    <WorkspaceShell orgName={me.org.name} role={me.role} orgKind={me.org.kind} userName={me.user.fullName}>
      <PageHeader
        title={`Hola, ${me.user.fullName.split(" ")[0]}`}
        description={today}
      />
      <div className="space-y-6">
        {/* Independiente: su panel ES este; los primeros pasos van acá. */}
        {me.role === "admin" && <OnboardingChecklist />}
        <ProToday />
      </div>
    </WorkspaceShell>
  );
}
