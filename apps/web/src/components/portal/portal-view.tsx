"use client";

import { useCallback, useEffect, useState } from "react";
import type { PortalMeDto } from "@nutreitor/shared";

import { Alert, Button, Card, EmptyState, Input, Loading, SectionHeading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { LineChart } from "@/components/patients/line-chart";
import { PlanView } from "@/components/patients/meal-plan-panel";
import { PortalAppointments } from "./portal-appointments";
import { PortalAssistant } from "./portal-assistant";

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("es-AR");

/**
 * Portal del paciente (solo su propia ficha). Lectura del plan + evolución +
 * profesionales + datos de salud propios. Auto-reporte de mediciones si está
 * habilitado. NUNCA muestra las notas clínicas del profesional.
 */
export function PortalView() {
  const [me, setMe] = useState<PortalMeDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMe(await api<PortalMeDto>("portal/me"));
      setState("ready");
    } catch {
      setState("none");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") return <Loading />;
  if (state === "none" || !me) {
    return (
      <p className="text-sm text-stone-500">
        No pudimos cargar tu información. Reintentá en un momento; si el problema
        sigue, escribile a tu profesional.
      </p>
    );
  }

  const weightSeries = me.metrics
    .filter((m) => m.weightKg != null)
    .map((m) => ({ label: fmtDate(m.measuredAt), value: m.weightKg as number }));

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}

      {me.professionals.length > 0 && (
        <p className="text-sm text-stone-500">
          Te acompaña{me.professionals.length > 1 ? "n" : ""}:{" "}
          <span className="text-stone-800">{me.professionals.join(", ")}</span>
        </p>
      )}

      <PortalAppointments />

      <Card>
        <SectionHeading className="mb-4">Tu plan</SectionHeading>
        {me.plan ? (
          <PlanView plan={me.plan} />
        ) : (
          <EmptyState>Todavía no tenés un plan activo.</EmptyState>
        )}
      </Card>

      <Card>
        <SectionHeading className="mb-4">Tu evolución</SectionHeading>
        <div className="mb-4 text-xs uppercase tracking-widest text-stone-500">Peso (kg)</div>
        <LineChart data={weightSeries} unit="kg" />

        {me.canSelfReport && <SelfReport onAdded={load} onError={setError} />}

        {me.metrics.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-4 font-medium">Fecha</th>
                  <th className="py-2 pr-4 font-medium">Peso</th>
                  <th className="py-2 pr-4 font-medium">% Grasa</th>
                  <th className="py-2 pr-4 font-medium">Cintura</th>
                  <th className="py-2 pr-4 font-medium">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {[...me.metrics].reverse().map((m) => (
                  <tr key={m.id} className="text-stone-800">
                    <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(m.measuredAt)}</td>
                    <td className="py-2 pr-4">{m.weightKg != null ? `${m.weightKg} kg` : "—"}</td>
                    <td className="py-2 pr-4">{m.bodyFatPct != null ? `${m.bodyFatPct} %` : "—"}</td>
                    <td className="py-2 pr-4">{m.waistCm != null ? `${m.waistCm} cm` : "—"}</td>
                    <td className="py-2 pr-4 text-xs text-stone-500">
                      {m.recordedByRole === "patient" ? "Vos" : m.recordedByName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {me.profile.clinical && <ClinicalCard clinical={me.profile.clinical} goal={me.profile.goal} />}

      {me.modules.includes("agents") && (
        <PortalAssistant hasAssignedProfessional={me.hasAssignedProfessional} />
      )}
    </div>
  );
}

function ClinicalCard({
  clinical,
  goal,
}: {
  clinical: NonNullable<PortalMeDto["profile"]["clinical"]>;
  goal: string | null;
}) {
  const allRows: [string, string | null][] = [
    ["Objetivo", goal],
    ["Motivo de consulta", clinical.reasonForConsult],
    ["Antecedentes médicos", clinical.medicalHistory],
    ["Alergias / intolerancias", clinical.allergies],
    ["Medicación actual", clinical.currentMedication],
    ["Patologías diagnosticadas", clinical.diagnosedConditions],
    ["Antecedentes familiares", clinical.familyHistory],
  ];
  // Sólo lo que el paciente tiene permitido ver (el resto llega null por la
  // visibilidad por campo). Si no hay nada, no mostramos una pared de "—".
  const rows = allRows.filter(([, value]) => value);
  if (rows.length === 0) return null;
  return (
    <Card>
      <SectionHeading className="mb-4">Tus datos de salud</SectionHeading>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-stone-500">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-line text-sm text-stone-800">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function SelfReport({
  onAdded,
  onError,
}: {
  onAdded: () => void;
  onError: (e: string) => void;
}) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [open, setOpen] = useState(false);
  const [measuredAt, setMeasuredAt] = useState(today);
  const [weightKg, setWeightKg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!weightKg.trim()) return;
    setBusy(true);
    onError("");
    try {
      await api("portal/me/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measuredAt, weightKg: Number(weightKg) }),
      });
      setWeightKg("");
      setOpen(false);
      onAdded();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mt-4">
        + Registrar mi peso
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 p-3">
      <label className="block">
        <span className="mb-1 block text-xs text-stone-500">Fecha</span>
        <Input type="date" value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-stone-500">Peso (kg)</span>
        <Input type="number" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
      </label>
      <Button type="submit" disabled={busy || !weightKg.trim()}>
        {busy ? "Guardando…" : "Guardar"}
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </form>
  );
}
