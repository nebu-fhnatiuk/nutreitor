"use client";

import { AlertTriangle, Droplets, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { sweatTestResults, type SweatTestDto, type SweatTestResults } from "@nutreitor/shared";

import { Alert, Button, Card, EmptyState, Input, Loading, Modal, SectionHeading, Textarea, cn, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

import { fmt, fmtMeasured, parseDecimal } from "./anthro-format";
import { LineChart } from "./line-chart";

/**
 * Hidratación del deportista (ADR 0036): pruebas de sudoración (peso antes y después,
 * lo que tomó, orina) y el plan de líquidos que sale de cada una.
 */
export function HydrationPanel({ patientId, canRecord }: { patientId: string; canRecord: boolean }) {
  const { confirm, toast } = useFeedback();
  const [tests, setTests] = useState<SweatTestDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SweatTestDto | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      setTests(await api<SweatTestDto[]>(`patients/${patientId}/sweat-tests`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(t: SweatTestDto) {
    const ok = await confirm({ title: "¿Borrar esta prueba?", body: `La del ${fmtMeasured(t.measuredOn)}.`, confirmLabel: "Borrar", tone: "danger" });
    if (!ok) return;
    try {
      await api(`patients/${patientId}/sweat-tests/${t.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!tests) return <Loading />;

  const series = [...tests].reverse().map((t) => ({ label: fmtMeasured(t.measuredOn), value: t.results.sweatRateLh }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionHeading>Pruebas de sudoración</SectionHeading>
          <p className="mt-1 text-sm text-stone-500">
            Peso antes y después de una sesión, sin ropa mojada y después de orinar. Con eso sale cuánto suda por hora y cuánto
            tiene que tomar.
          </p>
        </div>
        {canRecord && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> Nueva prueba
          </Button>
        )}
      </div>

      {tests.length === 0 ? (
        <Card>
          <EmptyState>Todavía no hay pruebas. Conviene repetirlas en condiciones distintas (calor, frío, partido, entrenamiento).</EmptyState>
        </Card>
      ) : (
        <>
          {series.length > 1 && (
            <Card>
              <div className="mb-3 text-xs uppercase tracking-widest text-stone-500">Tasa de sudoración (L/h)</div>
              <LineChart data={series} unit="L/h" />
            </Card>
          )}
          <ul className="space-y-3">
            {tests.map((t) => (
              <li key={t.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-stone-900">
                        {fmtMeasured(t.measuredOn)}
                        {t.sessionLabel && <span className="font-normal text-stone-500"> · {t.sessionLabel}</span>}
                      </p>
                      <p className="text-xs text-stone-500">
                        {[
                          `${t.durationMin} min`,
                          t.temperatureC != null ? `${fmt(t.temperatureC)} °C` : null,
                          t.humidityPct != null ? `${t.humidityPct} % de humedad` : null,
                          t.groupId ? "medición del plantel" : null,
                          t.recordedByName,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {canRecord && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(t)} aria-label="Editar prueba">
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => remove(t)} aria-label="Borrar prueba">
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </div>
                  <ResultsView r={t.results} />
                  {t.note && <p className="mt-3 whitespace-pre-line text-sm text-stone-600">{t.note}</p>}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && (
        <SweatTestForm
          patientId={patientId}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await load();
            setEditing(null);
            toast("Prueba guardada");
          }}
        />
      )}
    </div>
  );
}

export function ResultsView({ r }: { r: SweatTestResults }) {
  const over = r.dehydrationPct > 2;
  return (
    <div className="mt-4 space-y-3">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Tasa de sudoración" value={`${fmt(r.sweatRateLh, 2)} L/h`} />
        <Stat label="Sudor total" value={`${fmt(r.sweatLossL, 2)} L`} />
        <Stat label="Pérdida de peso" value={`${fmt(r.dehydrationPct)} %`} sub={`${fmt(r.weightLossKg, 2)} kg`} warn={over} />
        <Stat label="Repuso" value={r.replacementPct != null ? `${r.replacementPct} %` : "—"} sub="del sudor perdido" />
      </dl>
      {r.warnings.map((w) => (
        <p key={w} className="flex items-start gap-1.5 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {w}
        </p>
      ))}
      <div className="rounded-xl bg-sky-50/70 p-3 text-sm text-stone-700">
        <p className="flex items-center gap-1.5 font-medium text-stone-800">
          <Droplets className="h-4 w-4 text-sky-700" aria-hidden /> Plan de líquidos para una sesión igual
        </p>
        <ul className="mt-1.5 space-y-0.5">
          <li>
            <strong>Antes:</strong> {r.plan.beforeMl[0]}–{r.plan.beforeMl[1]} ml unas 4 horas antes.
          </li>
          <li>
            <strong>Durante:</strong>{" "}
            {r.plan.duringMlPerHour > 0
              ? `al menos ${r.plan.duringMlPerHour} ml por hora para no perder más del 2 %.`
              : "con lo que tomó alcanza para quedar por debajo del 2 %."}
          </li>
          <li>
            <strong>Después:</strong>{" "}
            {r.plan.afterMl[1] > 0 ? `${r.plan.afterMl[0]}–${r.plan.afterMl[1]} ml en las horas siguientes.` : "no hace falta reponer peso perdido."}
          </li>
          {r.plan.suggestSodium && <li>Sumar sodio: la sesión es larga o suda mucho.</li>}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, warn = false }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className={cn("font-semibold tabular-nums", warn ? "text-amber-700" : "text-stone-900")}>{value}</dd>
      {sub && <dd className="text-xs text-stone-500">{sub}</dd>}
    </div>
  );
}

const str = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

function SweatTestForm({
  patientId,
  initial,
  onClose,
  onSaved,
}: {
  patientId: string;
  initial: SweatTestDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [f, setF] = useState({
    measuredOn: initial?.measuredOn ?? new Date().toLocaleDateString("en-CA"),
    sessionLabel: initial?.sessionLabel ?? "",
    durationMin: str(initial?.durationMin ?? 60),
    temperatureC: str(initial?.temperatureC),
    humidityPct: str(initial?.humidityPct),
    preWeightKg: str(initial?.preWeightKg),
    postWeightKg: str(initial?.postWeightKg),
    fluidIntakeMl: str(initial?.fluidIntakeMl ?? 0),
    urineMl: str(initial?.urineMl ?? 0),
    note: initial?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const nums = {
    durationMin: parseDecimal(f.durationMin),
    preWeightKg: parseDecimal(f.preWeightKg),
    postWeightKg: parseDecimal(f.postWeightKg),
    fluidIntakeMl: parseDecimal(f.fluidIntakeMl) ?? 0,
    urineMl: parseDecimal(f.urineMl) ?? 0,
  };
  const preview =
    nums.durationMin && nums.preWeightKg && nums.postWeightKg
      ? sweatTestResults({ ...nums, durationMin: nums.durationMin, preWeightKg: nums.preWeightKg, postWeightKg: nums.postWeightKg })
      : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!nums.durationMin || !nums.preWeightKg || !nums.postWeightKg) return setErr("Faltan la duración o los pesos.");
    setBusy(true);
    try {
      await api(`patients/${patientId}/sweat-tests${initial ? `/${initial.id}` : ""}`, {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          measuredOn: f.measuredOn,
          sessionLabel: f.sessionLabel.trim() || null,
          durationMin: Math.round(nums.durationMin),
          temperatureC: parseDecimal(f.temperatureC),
          humidityPct: f.humidityPct ? Math.round(parseDecimal(f.humidityPct) ?? 0) : null,
          preWeightKg: nums.preWeightKg,
          postWeightKg: nums.postWeightKg,
          fluidIntakeMl: Math.round(nums.fluidIntakeMl),
          urineMl: Math.round(nums.urineMl),
          note: f.note.trim() || null,
        }),
      });
      await onSaved();
    } catch (e2) {
      setErr(errorMessage(e2));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? "Editar prueba de sudoración" : "Nueva prueba de sudoración"} className="sm:max-w-2xl">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fecha">
            <Input type="date" value={f.measuredOn} onChange={set("measuredOn")} required />
          </Field>
          <Field label="Sesión (opcional)" className="sm:col-span-2">
            <Input value={f.sessionLabel} onChange={set("sessionLabel")} maxLength={60} placeholder="Entrenamiento, partido, fondo…" />
          </Field>
          <Field label="Duración (min)">
            <Input value={f.durationMin} onChange={set("durationMin")} inputMode="numeric" required />
          </Field>
          <Field label="Temperatura (°C)">
            <Input value={f.temperatureC} onChange={set("temperatureC")} inputMode="decimal" />
          </Field>
          <Field label="Humedad (%)">
            <Input value={f.humidityPct} onChange={set("humidityPct")} inputMode="numeric" />
          </Field>
          <Field label="Peso antes (kg)">
            <Input value={f.preWeightKg} onChange={set("preWeightKg")} inputMode="decimal" required />
          </Field>
          <Field label="Peso después (kg)">
            <Input value={f.postWeightKg} onChange={set("postWeightKg")} inputMode="decimal" required />
          </Field>
          <div />
          <Field label="Tomó durante (ml)">
            <Input value={f.fluidIntakeMl} onChange={set("fluidIntakeMl")} inputMode="numeric" />
          </Field>
          <Field label="Orinó durante (ml)">
            <Input value={f.urineMl} onChange={set("urineMl")} inputMode="numeric" />
          </Field>
        </div>
        {preview && <ResultsView r={preview} />}
        <Field label="Nota (opcional)">
          <Textarea value={f.note} onChange={set("note")} rows={2} maxLength={1000} />
        </Field>
        {err && <Alert>{err}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Guardando…" : "Guardar prueba"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block text-sm", className)}>
      <span className="mb-1 block text-xs text-stone-500">{label}</span>
      {children}
    </label>
  );
}
