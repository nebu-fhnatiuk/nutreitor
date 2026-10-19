"use client";

import { User, Users } from "lucide-react";
import { useState } from "react";
import type { OrgKind } from "@nutreitor/shared";

import { Alert, Button, Card, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/**
 * Tipo de cuenta (ADR 0026). Independiente → equipo cuando suma colegas; de vuelta
 * a independiente sólo si quedó sola (lo valida la API). Recarga para que el menú y
 * el inicio cambien de forma.
 */
export function AccountKind({ kind }: { kind: OrgKind }) {
  const { confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toTeam = kind === "individual";

  async function change() {
    const ok = await confirm({
      title: toTeam ? "¿Pasar a equipo?" : "¿Pasar a independiente?",
      body: toTeam
        ? "Vas a poder invitar colegas y ver el panel de administración. Tus pacientes, planes y agenda no cambian."
        : "Se oculta todo lo de equipo y entrás directo a tu día. Tus pacientes, planes y agenda no cambian.",
      confirmLabel: toTeam ? "Pasar a equipo" : "Pasar a independiente",
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await api("organizations/current/kind", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: toTeam ? "team" : "individual" }),
      });
      window.location.assign(toTeam ? "/admin" : "/pro");
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  }

  const Icon = toTeam ? User : Users;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
          <div>
            <p className="font-medium text-stone-900">
              {toTeam ? "Profesional independiente" : "Equipo"}
            </p>
            <p className="mt-0.5 text-sm text-stone-500">
              {toTeam
                ? "Trabajás solo/a. Si sumás colegas, pasá tu cuenta a equipo."
                : "Varias personas atienden en esta organización."}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={change} disabled={busy}>
          {toTeam ? "Sumar colegas" : "Pasar a independiente"}
        </Button>
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
    </Card>
  );
}
