"use client";

import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { PortalMeDto } from "@nutreitor/shared";

import { PlanView } from "@/components/patients/meal-plan-panel";
import { Alert, Button, Card, EmptyState, Loading, PageHeader } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/**
 * Plan completo del paciente, listo para imprimir o guardar como PDF (el diálogo
 * de impresión del navegador lo ofrece en todos los sistemas). Al imprimir se
 * oculta el shell (nav, topbar) y el botón: sale sólo el plan.
 */
export function PortalPlan() {
  const [plan, setPlan] = useState<PortalMeDto["plan"] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PortalMeDto>("portal/me")
      .then((me) => setPlan(me.plan))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <div>
      <PageHeader
        title="Mi plan"
        description="Tu plan alimentario vigente."
        actions={
          plan ? (
            <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
              <Printer className="h-4 w-4" aria-hidden />
              Imprimir o guardar PDF
            </Button>
          ) : undefined
        }
      />
      {error && <Alert>{error}</Alert>}
      {plan === undefined && !error ? (
        <Loading />
      ) : plan ? (
        <Card className="print:border-0 print:p-0 print:shadow-none">
          <PlanView plan={plan} forPatient />
        </Card>
      ) : (
        <EmptyState>Todavía no tenés un plan activo. Tu profesional lo va a cargar pronto.</EmptyState>
      )}
    </div>
  );
}
