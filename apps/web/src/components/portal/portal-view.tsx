"use client";

import { useCallback, useEffect, useState } from "react";
import type { PortalMeDto } from "@nutreitor/shared";

import { api } from "@/lib/api";
import { LineChart } from "@/components/patients/line-chart";
import { PlanView } from "@/components/patients/meal-plan-panel";

const inputCls =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20";
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("es-AR");

const card = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm";
const h2 = "mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400";

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

  if (state === "loading") return <p className="text-sm text-stone-400">Cargando…</p>;
  if (state === "none" || !me) {
    return (
      <p className="text-sm text-stone-500">
        Todavía no hay una ficha vinculada a tu cuenta. Escribile a tu profesional.
      </p>
    );
  }

  const weightSeries = me.metrics
    .filter((m) => m.weightKg != null)
    .map((m) => ({ label: fmtDate(m.measuredAt), value: m.weightKg as number }));

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {me.professionals.length > 0 && (
        <p className="text-sm text-stone-500">
          Te acompaña{me.professionals.length > 1 ? "n" : ""}:{" "}
          <span className="text-stone-800">{me.professionals.join(", ")}</span>
        </p>
      )}

      <section className={card}>
        <h2 className={h2}>Tu plan</h2>
        {me.plan ? (
          <PlanView plan={me.plan} />
        ) : (
          <p className="text-sm text-stone-400">Todavía no tenés un plan activo.</p>
        )}
      </section>

      <section className={card}>
        <h2 className={h2}>Tu evolución</h2>
        <div className="mb-4 text-xs uppercase tracking-widest text-stone-400">Peso (kg)</div>
        <LineChart data={weightSeries} unit="kg" />

        {me.canSelfReport && <SelfReport onAdded={load} onError={setError} />}

        {me.metrics.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-stone-400">
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
                    <td className="py-2 pr-4 text-xs text-stone-400">
                      {m.recordedByRole === "patient" ? "Vos" : m.recordedByName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {me.profile.clinical && <ClinicalCard clinical={me.profile.clinical} goal={me.profile.goal} />}
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
  const rows: [string, string | null][] = [
    ["Objetivo", goal],
    ["Motivo de consulta", clinical.reasonForConsult],
    ["Antecedentes médicos", clinical.medicalHistory],
    ["Alergias / intolerancias", clinical.allergies],
    ["Medicación actual", clinical.currentMedication],
    ["Patologías diagnosticadas", clinical.diagnosedConditions],
    ["Antecedentes familiares", clinical.familyHistory],
  ];
  return (
    <section className={card}>
      <h2 className={h2}>Tus datos de salud</h2>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-stone-400">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-line text-sm text-stone-800">
              {value || <span className="text-stone-300">—</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
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
      onError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110"
      >
        + Registrar mi peso
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 p-3">
      <label className="block">
        <span className="mb-1 block text-xs text-stone-500">Fecha</span>
        <input type="date" value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-stone-500">Peso (kg)</span>
        <input type="number" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className={inputCls} />
      </label>
      <button
        type="submit"
        disabled={busy || !weightKg.trim()}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-40"
      >
        {busy ? "Guardando…" : "Guardar"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-stone-500 transition hover:bg-stone-100">
        Cancelar
      </button>
    </form>
  );
}
