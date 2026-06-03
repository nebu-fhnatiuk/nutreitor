"use client";

import { useCallback, useEffect, useState } from "react";
import type { PatientMetricDto } from "@nutreitor/shared";

import { api } from "@/lib/api";
import { LineChart } from "./line-chart";

const inputCls =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("es-AR");

/**
 * Sección "Evolución": serie temporal de mediciones del paciente. Gráfico de peso
 * + tabla + alta rápida. Las mediciones son editables/borrables (data entry).
 */
export function MetricsPanel({
  patientId,
  canRecord,
}: {
  patientId: string;
  canRecord: boolean;
}) {
  const [metrics, setMetrics] = useState<PatientMetricDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMetrics(await api<PatientMetricDto[]>(`patients/${patientId}/metrics`));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const weightSeries = metrics
    .filter((m) => m.weightKg != null)
    .map((m) => ({ label: fmtDate(m.measuredAt), value: m.weightKg as number }));

  async function del(id: string) {
    setError(null);
    try {
      await api(`patients/${patientId}/metrics/${id}`, { method: "DELETE" });
      void load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
        Evolución{loading && <span className="ml-2 text-stone-400">cargando…</span>}
      </h2>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6">
        <div className="mb-1 text-xs uppercase tracking-widest text-stone-400">Peso (kg)</div>
        <LineChart data={weightSeries} unit="kg" />
      </div>

      {canRecord && <AddMetric patientId={patientId} onAdded={load} onError={setError} />}

      {metrics.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="py-2 pr-4 font-medium">Fecha</th>
                <th className="py-2 pr-4 font-medium">Peso</th>
                <th className="py-2 pr-4 font-medium">% Grasa</th>
                <th className="py-2 pr-4 font-medium">M. muscular</th>
                <th className="py-2 pr-4 font-medium">Cintura</th>
                <th className="py-2 pr-4 font-medium">Cadera</th>
                <th className="py-2 pr-4 font-medium">Por</th>
                {canRecord && <th className="py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {[...metrics].reverse().map((m) => (
                <tr key={m.id} className="text-stone-800">
                  <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(m.measuredAt)}</td>
                  <Cell v={m.weightKg} u="kg" />
                  <Cell v={m.bodyFatPct} u="%" />
                  <Cell v={m.muscleMassKg} u="kg" />
                  <Cell v={m.waistCm} u="cm" />
                  <Cell v={m.hipCm} u="cm" />
                  <td className="py-2 pr-4 text-xs text-stone-400">{m.recordedByName}</td>
                  {canRecord && (
                    <td className="py-2 text-right">
                      <button
                        onClick={() => del(m.id)}
                        className="text-xs text-stone-400 transition hover:text-red-600"
                      >
                        Borrar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Cell({ v, u }: { v: number | null; u: string }) {
  return (
    <td className="py-2 pr-4 whitespace-nowrap">
      {v == null ? <span className="text-stone-300">—</span> : `${v} ${u}`}
    </td>
  );
}

function AddMetric({
  patientId,
  onAdded,
  onError,
}: {
  patientId: string;
  onAdded: () => void;
  onError: (e: string) => void;
}) {
  // Fecha LOCAL (no UTC): toISOString() adelantaría un día de noche en AR (UTC-3).
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    measuredAt: today,
    weightKg: "",
    bodyFatPct: "",
    muscleMassKg: "",
    waistCm: "",
    hipCm: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const upd = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const numOrUndef = (v: string) => (v.trim() ? Number(v) : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      await api(`patients/${patientId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          measuredAt: f.measuredAt,
          weightKg: numOrUndef(f.weightKg),
          bodyFatPct: numOrUndef(f.bodyFatPct),
          muscleMassKg: numOrUndef(f.muscleMassKg),
          waistCm: numOrUndef(f.waistCm),
          hipCm: numOrUndef(f.hipCm),
          note: f.note.trim() || undefined,
        }),
      });
      setF({ ...f, weightKg: "", bodyFatPct: "", muscleMassKg: "", waistCm: "", hipCm: "", note: "" });
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
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110"
      >
        + Cargar medición
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-stone-200 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <L label="Fecha">
          <input type="date" value={f.measuredAt} onChange={(e) => upd("measuredAt", e.target.value)} className={inputCls} />
        </L>
        <L label="Peso (kg)">
          <input type="number" step="0.1" value={f.weightKg} onChange={(e) => upd("weightKg", e.target.value)} className={inputCls} />
        </L>
        <L label="% Grasa">
          <input type="number" step="0.1" value={f.bodyFatPct} onChange={(e) => upd("bodyFatPct", e.target.value)} className={inputCls} />
        </L>
        <L label="Masa muscular (kg)">
          <input type="number" step="0.1" value={f.muscleMassKg} onChange={(e) => upd("muscleMassKg", e.target.value)} className={inputCls} />
        </L>
        <L label="Cintura (cm)">
          <input type="number" step="0.1" value={f.waistCm} onChange={(e) => upd("waistCm", e.target.value)} className={inputCls} />
        </L>
        <L label="Cadera (cm)">
          <input type="number" step="0.1" value={f.hipCm} onChange={(e) => upd("hipCm", e.target.value)} className={inputCls} />
        </L>
        <L label="Nota (opcional)" wide>
          <input value={f.note} onChange={(e) => upd("note", e.target.value)} className={inputCls} />
        </L>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Guardar medición"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-stone-500 transition hover:bg-stone-100">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function L({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={wide ? "block sm:col-span-3" : "block"}>
      <span className="mb-1 block text-xs text-stone-500">{label}</span>
      {children}
    </label>
  );
}
