"use client";

import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { PortalMeDto } from "@nutreitor/shared";

import { ShoppingListView } from "@/components/patients/shopping-list";
import { Alert, Button, Card, EmptyState, Loading, PageHeader } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/** Lista de compras del paciente (de su plan activo), lista para imprimir. */
export function PortalShopping() {
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
        title="Lista de compras"
        description="Lo que necesitás para una semana de tu plan, ordenado por góndola."
        actions={
          plan ? (
            <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
              <Printer className="h-4 w-4" aria-hidden />
              Imprimir
            </Button>
          ) : undefined
        }
      />
      {error && <Alert>{error}</Alert>}
      {plan === undefined && !error ? (
        <Loading />
      ) : plan ? (
        <Card className="print:border-0 print:p-0 print:shadow-none">
          <ShoppingListView body={plan.body} />
        </Card>
      ) : (
        <EmptyState>Todavía no tenés un plan activo.</EmptyState>
      )}
    </div>
  );
}
