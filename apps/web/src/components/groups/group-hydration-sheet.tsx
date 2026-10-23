"use client";

import { ArrowLeft, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GROUP_SWEAT_MAX, sweatTestResults, type GroupDetailDto } from "@nutreitor/shared";

import { FieldMode, type FieldStep } from "@/components/field/field-mode";
import { fmt, parseDecimal } from "@/components/patients/anthro-format";
import { Alert, Button, Input, Loading, PageHeader, cn, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/**
 * Hidratación del plantel (ADR 0036): se pesa a todos antes y después de la misma
 * sesión. Filas = deportistas; la tasa y el % se ven mientras se carga. El borrador se
 * guarda en el navegador, como la planilla de antropometría (ADR 0031).
 */
type RowDraft = { pre: string; post: string; intake: string; urine: string };
interface Stored {
  measuredOn: string;
  sessionLabel: string;
  durationMin: string;
  temperatureC: string;
  humidityPct: string;
  rows: Record<string, RowDraft>;
}

const empty: RowDraft = { pre: "", post: "", intake: "", urine: "" };
const today = () => new Date().toLocaleDateString("en-CA");
const COLS: { key: keyof RowDraft; label: string; unit: string }[] = [
  { key: "pre", label: "Peso antes", unit: "kg" },
  { key: "post", label: "Peso después", unit: "kg" },
  { key: "intake", label: "Tomó", unit: "ml" },
  { key: "urine", label: "Orinó", unit: "ml" },
];

export function GroupHydrationSheet({ id, basePath }: { id: string; basePath: string }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const storageKey = `nutreitor:group-sweat:${id}`;
  const [group, setGroup] = useState<GroupDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<Stored>({ measuredOn: today(), sessionLabel: "", durationMin: "90", temperatureC: "", humidityPct: "", rows: {} });
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  // Modo cancha (KAN-74): antes de la sesión se pesa a todos; después, el resto.
  const [field, setField] = useState<"antes" | "despues" | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    api<GroupDetailDto>(`groups/${id}`).then(setGroup, (e) => setError(errorMessage(e)));
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Stored;
        if (parsed?.rows && Object.keys(parsed.rows).length > 0) {
          setS(parsed);
          setRestored(true);
        }
      }
    } catch {
      // Sin almacenamiento: la planilla funciona igual, sin borrador.
    }
    loaded.current = true;
  }, [id, storageKey]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (Object.keys(s.rows).length === 0) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
      // idem
    }
  }, [s, storageKey]);

  const duration = parseDecimal(s.durationMin);
  const setRow = (pid: string, k: keyof RowDraft, v: string) =>
    setS((x) => {
      const row = { ...(x.rows[pid] ?? empty), [k]: v };
      const rows = { ...x.rows };
      if (Object.values(row).every((c) => c === "")) delete rows[pid];
      else rows[pid] = row;
      return { ...x, rows };
    });

  function resultFor(row: RowDraft | undefined) {
    const pre = parseDecimal(row?.pre ?? "");
    const post = parseDecimal(row?.post ?? "");
    if (!duration || !pre || !post) return null;
    return sweatTestResults({ preWeightKg: pre, postWeightKg: post, durationMin: duration, fluidIntakeMl: parseDecimal(row!.intake) ?? 0, urineMl: parseDecimal(row!.urine) ?? 0 });
  }

  async function discard() {
    if (!(await confirm({ title: "¿Descartar lo cargado?", confirmLabel: "Descartar", tone: "danger" }))) return;
    setS((x) => ({ ...x, rows: {} }));
    setRestored(false);
  }

  async function save() {
    setSaveErr(null);
    if (!duration) return setSaveErr("Falta la duración de la sesión.");
    const members = group?.members ?? [];
    const incomplete = members.filter((m) => s.rows[m.patientId] && !resultFor(s.rows[m.patientId]));
    if (incomplete.length) return setSaveErr(`Faltan los pesos de: ${incomplete.map((m) => m.fullName).join(", ")}.`);
    const entries = members
      .filter((m) => resultFor(s.rows[m.patientId]))
      .map((m) => {
        const r = s.rows[m.patientId]!;
        return {
          patientId: m.patientId,
          preWeightKg: parseDecimal(r.pre)!,
          postWeightKg: parseDecimal(r.post)!,
          fluidIntakeMl: Math.round(parseDecimal(r.intake) ?? 0),
          urineMl: Math.round(parseDecimal(r.urine) ?? 0),
        };
      });
    if (entries.length === 0) return setSaveErr("Todavía no cargaste ninguna medición.");
    if (!(await confirm({ title: entries.length === 1 ? "¿Guardar 1 prueba?" : `¿Guardar ${entries.length} pruebas?`, confirmLabel: "Guardar" }))) return;
    setBusy(true);
    try {
      await api(`groups/${id}/sweat-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          measuredOn: s.measuredOn,
          sessionLabel: s.sessionLabel.trim() || null,
          durationMin: Math.round(duration),
          temperatureC: parseDecimal(s.temperatureC),
          humidityPct: s.humidityPct ? Math.round(parseDecimal(s.humidityPct) ?? 0) : null,
          entries,
        }),
      });
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // sin almacenamiento
      }
      toast(entries.length === 1 ? "Prueba guardada" : `${entries.length} pruebas guardadas`);
      router.push(`${basePath}/${id}`);
    } catch (e) {
      setSaveErr(errorMessage(e));
      setBusy(false);
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!group) return <Loading />;
  const members = group.members;

  const FIELD_LIMITS: Record<keyof RowDraft, [number, number]> = { pre: [25, 250], post: [25, 250], intake: [0, 6000], urine: [0, 3000] };
  function fieldSteps(moment: "antes" | "despues"): FieldStep[] {
    const keys: (keyof RowDraft)[] = moment === "antes" ? ["pre"] : ["post", "intake", "urine"];
    return members.flatMap((m) =>
      keys.map((k) => {
        const col = COLS.find((c) => c.key === k)!;
        const r = resultFor(s.rows[m.patientId]);
        return {
          id: `${m.patientId}:${k}`,
          who: m.fullName,
          key: k,
          label: col.label,
          unit: col.unit,
          sub: moment === "antes" ? "Antes de la sesión" : "Después de la sesión",
          value: s.rows[m.patientId]?.[k] ?? "",
          min: FIELD_LIMITS[k][0],
          max: FIELD_LIMITS[k][1],
          hint:
            k !== "pre" && r ? (
              <span className="font-display font-semibold tabular-nums">
                Perdió {fmt(r.dehydrationPct)} % · {fmt(r.sweatRateLh, 2)} L/h
              </span>
            ) : k === "post" && s.rows[m.patientId]?.pre ? (
              <span className="font-display font-semibold tabular-nums">Antes {s.rows[m.patientId]!.pre} kg</span>
            ) : null,
        };
      }),
    );
  }

  return (
    <div className="space-y-5">
      <Link href={`${basePath}/${id}`} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-brand">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {group.name}
      </Link>
      <PageHeader
        title="Medir hidratación"
        description="Pesá a cada deportista sin ropa mojada, antes y después de la misma sesión, y anotá lo que tomó y orinó en el medio."
      />
      {members.length > GROUP_SWEAT_MAX && <Alert>El grupo tiene más de {GROUP_SWEAT_MAX} deportistas: guardá en tandas.</Alert>}
      {restored && (
        <Alert tone="info">
          Recuperamos lo que habías cargado en esta planilla.{" "}
          <button onClick={discard} className="font-medium underline">
            Descartar
          </button>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setField("antes")} disabled={members.length === 0}>
          <Smartphone className="h-4 w-4" aria-hidden /> Modo cancha: antes
        </Button>
        <Button variant="secondary" onClick={() => setField("despues")} disabled={members.length === 0}>
          <Smartphone className="h-4 w-4" aria-hidden /> Modo cancha: después
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="Fecha">
          <Input type="date" value={s.measuredOn} onChange={(e) => setS((x) => ({ ...x, measuredOn: e.target.value }))} />
        </Field>
        <Field label="Sesión" className="col-span-2 sm:col-span-1">
          <Input value={s.sessionLabel} onChange={(e) => setS((x) => ({ ...x, sessionLabel: e.target.value }))} placeholder="Entrenamiento" maxLength={60} />
        </Field>
        <Field label="Duración (min)">
          <Input value={s.durationMin} onChange={(e) => setS((x) => ({ ...x, durationMin: e.target.value }))} inputMode="numeric" />
        </Field>
        <Field label="Temperatura (°C)">
          <Input value={s.temperatureC} onChange={(e) => setS((x) => ({ ...x, temperatureC: e.target.value }))} inputMode="decimal" />
        </Field>
        <Field label="Humedad (%)">
          <Input value={s.humidityPct} onChange={(e) => setS((x) => ({ ...x, humidityPct: e.target.value }))} inputMode="numeric" />
        </Field>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-surface shadow-sm">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-xs text-stone-500">
              <th className="sticky left-0 z-10 min-w-[7.5rem] bg-stone-50 px-3 py-2 text-left font-medium sm:min-w-[11rem] sm:px-4">Deportista</th>
              {COLS.map((c) => (
                <th key={c.key} className="px-1.5 py-2 text-center font-medium">
                  {c.label} <span className="font-normal text-stone-400">{c.unit}</span>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">L/h</th>
              <th className="px-3 py-2 text-right font-medium">Pérdida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {members.map((m) => {
              const row = s.rows[m.patientId];
              const r = resultFor(row);
              return (
                <tr key={m.patientId}>
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left font-medium leading-tight text-stone-800 sm:px-4">
                    {m.fullName}
                  </th>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-1 py-1">
                      <input
                        inputMode="decimal"
                        value={row?.[c.key] ?? ""}
                        onChange={(e) => setRow(m.patientId, c.key, e.target.value)}
                        aria-label={`${m.fullName}, ${c.label.toLowerCase()}`}
                        className="h-9 w-full min-w-[4.5rem] rounded-md border border-stone-200 px-1.5 text-right tabular-nums outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right tabular-nums text-stone-700">{r ? fmt(r.sweatRateLh, 2) : ""}</td>
                  <td className={cn("px-3 py-1.5 text-right tabular-nums", r && r.dehydrationPct > 2 ? "font-medium text-amber-700" : "text-stone-700")}>
                    {r ? `${fmt(r.dehydrationPct)} %` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {saveErr && <Alert>{saveErr}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-500">
          {members.filter((m) => resultFor(s.rows[m.patientId])).length} de {members.length} con datos
        </p>
        <div className="flex gap-2">
          {Object.keys(s.rows).length > 0 && (
            <Button variant="ghost" onClick={discard}>
              Descartar
            </Button>
          )}
          <Button onClick={save} disabled={busy}>
            {busy ? "Guardando…" : "Guardar mediciones"}
          </Button>
        </div>
      </div>

      {field && (
        <FieldMode
          title={`${group.name} · ${field === "antes" ? "Antes" : "Después"}`}
          steps={fieldSteps(field)}
          targets={[
            { key: "pre", label: "Peso antes", aliases: ["antes"] },
            { key: "post", label: "Peso después", aliases: ["despues", "peso"] },
            { key: "intake", label: "Tomó", aliases: ["tomo", "bebio", "liquido"] },
            { key: "urine", label: "Orinó", aliases: ["orino", "orina"] },
          ]}
          onChange={(stepId, v) => {
            const [pid, k] = stepId.split(":") as [string, keyof RowDraft];
            setRow(pid, k, v);
          }}
          onClose={() => setField(null)}
        />
      )}
    </div>
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
