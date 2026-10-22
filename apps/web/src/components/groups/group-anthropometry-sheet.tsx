"use client";

import { ArrowLeft, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ANTHRO_SITES,
  GROUP_BATCH_MAX,
  ageAt,
  anthropometryResults,
  needsThirdTake,
  type AnthroSiteKey,
  type AnthroTakes,
  type GroupDetailDto,
  type GroupMemberDto,
} from "@nutreitor/shared";

import { fmt, parseDecimal, val } from "@/components/patients/anthro-format";
import { Alert, Button, Input, Loading, PageHeader, cn, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/**
 * Planilla para medir a un plantel entero (ADR 0031). Se carga por PASADAS, como en
 * el protocolo ISAK: primero la toma 1 de todos los sitios, después la toma 2; la
 * pasada 3 sólo habilita los sitios donde las dos primeras difieren. Filas =
 * deportistas, columnas = sitios. Enter baja al siguiente deportista en el mismo
 * sitio (para quien mide sitio por sitio). El borrador se guarda en el navegador
 * para no perder una tarde de medición si se cierra la pestaña.
 */

type Pass = 0 | 1 | 2;
type Row = Partial<Record<AnthroSiteKey, [string, string, string]>>;
type Draft = Record<string, Row>;
interface Stored {
  measuredAt: string;
  kerrBlock: boolean;
  draft: Draft;
}

const SINGLE: AnthroSiteKey[] = ["bodyMass"]; // la masa se toma una vez
const today = () => new Date().toLocaleDateString("en-CA");

function rowTakes(row: Row | undefined, kerrBlock: boolean): AnthroTakes {
  const out: AnthroTakes = {};
  for (const [k, raw] of Object.entries(row ?? {}) as [AnthroSiteKey, [string, string, string]][]) {
    if (!kerrBlock && ANTHRO_SITES.find((s) => s.key === k)!.kerr) continue;
    const nums = raw.map(parseDecimal).filter((n): n is number => n !== null);
    if (nums.length) out[k] = nums;
  }
  return out;
}

const firstTwo = (raw: [string, string, string] | undefined) =>
  [parseDecimal(raw?.[0] ?? ""), parseDecimal(raw?.[1] ?? "")].filter((n): n is number => n !== null);

function outOfRange(key: AnthroSiteKey, s: string): boolean {
  const n = parseDecimal(s);
  const site = ANTHRO_SITES.find((x) => x.key === key)!;
  return s.trim() !== "" && (n === null || n < site.min || n > site.max);
}

export function GroupAnthropometrySheet({ id, basePath }: { id: string; basePath: string }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const storageKey = `nutreitor:group-anthro:${id}`;
  const [group, setGroup] = useState<GroupDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [measuredAt, setMeasuredAt] = useState(today);
  const [kerrBlock, setKerrBlock] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [pass, setPass] = useState<Pass>(0);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const loaded = useRef(false);
  const cells = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    api<GroupDetailDto>(`groups/${id}`).then(setGroup, (e) => setError(errorMessage(e)));
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw) as Stored;
        if (s && typeof s.draft === "object" && Object.keys(s.draft).length > 0) {
          setMeasuredAt(s.measuredAt || today());
          setKerrBlock(Boolean(s.kerrBlock));
          setDraft(s.draft);
          setRestored(true);
        }
      }
    } catch {
      // Sin almacenamiento disponible: la planilla funciona igual, sin borrador.
    }
    loaded.current = true;
  }, [id, storageKey]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (Object.keys(draft).length === 0) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify({ measuredAt, kerrBlock, draft } satisfies Stored));
    } catch {
      // idem: el borrador es una comodidad, no un requisito.
    }
  }, [draft, measuredAt, kerrBlock, storageKey]);

  const sites = useMemo(() => ANTHRO_SITES.filter((s) => kerrBlock || !s.kerr), [kerrBlock]);
  const members = group?.members ?? [];

  const pendingThird = useMemo(() => {
    const out: { member: GroupMemberDto; key: AnthroSiteKey }[] = [];
    for (const m of members) {
      for (const s of sites) {
        const raw = draft[m.patientId]?.[s.key];
        if (needsThirdTake(s.key, firstTwo(raw)) && !(raw?.[2] ?? "").trim()) out.push({ member: m, key: s.key });
      }
    }
    return out;
  }, [members, sites, draft]);

  const set = useCallback((patientId: string, key: AnthroSiteKey, i: Pass, v: string) => {
    setDraft((d) => {
      const row = { ...(d[patientId] ?? {}) };
      const takes = [...(row[key] ?? ["", "", ""])] as [string, string, string];
      takes[i] = v;
      if (takes.every((t) => t === "")) delete row[key];
      else row[key] = takes;
      const next = { ...d };
      if (Object.keys(row).length === 0) delete next[patientId];
      else next[patientId] = row;
      return next;
    });
  }, []);

  /** ¿La celda se puede cargar en esta pasada? */
  function editable(patientId: string, key: AnthroSiteKey): boolean {
    if (pass === 0) return true;
    if (SINGLE.includes(key)) return false;
    if (pass === 1) return true;
    const raw = draft[patientId]?.[key];
    return needsThirdTake(key, firstTwo(raw)) || (raw?.[2] ?? "") !== "";
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>, rowIdx: number, key: AnthroSiteKey) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // Enter: al siguiente deportista que tenga esa celda habilitada.
    for (let r = rowIdx + 1; r < members.length; r++) {
      const el = cells.current.get(`${members[r]!.patientId}:${key}`);
      if (el && !el.disabled) {
        el.focus();
        el.select();
        return;
      }
    }
  }

  async function discard() {
    const ok = await confirm({ title: "¿Descartar lo cargado?", body: "Se borran todas las tomas de esta planilla.", confirmLabel: "Descartar", tone: "danger" });
    if (!ok) return;
    setDraft({});
    setRestored(false);
  }

  async function save() {
    setSaveErr(null);
    const bad: string[] = [];
    for (const m of members) {
      for (const s of sites) {
        if ((draft[m.patientId]?.[s.key] ?? []).some((v) => outOfRange(s.key, v))) bad.push(`${m.fullName}: ${s.label}`);
      }
    }
    if (bad.length) {
      setSaveErr(`Hay valores fuera de rango (revisá si es un error de tipeo): ${bad.slice(0, 6).join("; ")}${bad.length > 6 ? "…" : ""}.`);
      return;
    }
    if (pendingThird.length) {
      setPass(2);
      setSaveErr(`Faltan ${pendingThird.length} terceras tomas: están marcadas en la pasada 3.`);
      return;
    }
    const entries = members
      .map((m) => ({ patientId: m.patientId, takes: rowTakes(draft[m.patientId], kerrBlock) }))
      .filter((e) => Object.keys(e.takes).length > 0);
    if (entries.length === 0) {
      setSaveErr("Todavía no cargaste ninguna medición.");
      return;
    }
    const missing = members.length - entries.length;
    const ok = await confirm({
      title: entries.length === 1 ? "¿Guardar 1 sesión?" : `¿Guardar ${entries.length} sesiones?`,
      body: `Fecha ${measuredAt.split("-").reverse().join("/")}.${missing > 0 ? ` ${missing} sin datos quedan afuera.` : ""}`,
      confirmLabel: "Guardar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`groups/${id}/anthropometry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measuredAt, entries }),
      });
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // sin almacenamiento: nada que limpiar
      }
      toast(entries.length === 1 ? "Sesión guardada" : `${entries.length} sesiones guardadas`);
      router.push(`${basePath}/${id}`);
    } catch (e) {
      setSaveErr(errorMessage(e));
      setBusy(false);
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!group) return <Loading />;

  const loadedCount = members.filter((m) => Object.keys(rowTakes(draft[m.patientId], kerrBlock)).length > 0).length;
  const passes: { id: Pass; label: string; badge?: number }[] = [
    { id: 0, label: "Pasada 1" },
    { id: 1, label: "Pasada 2" },
    { id: 2, label: "Pasada 3", badge: pendingThird.length },
  ];

  return (
    <div className="space-y-5">
      <Link href={`${basePath}/${id}`} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-brand">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {group.name}
      </Link>
      <PageHeader
        title="Medir plantel"
        description={`${group.name} · ${members.length === 1 ? "1 deportista" : `${members.length} deportistas`}. Una pasada por toma, como en el protocolo ISAK: la tercera sólo donde las dos primeras difieren.`}
      />

      {members.length > GROUP_BATCH_MAX && (
        <Alert>El grupo tiene más de {GROUP_BATCH_MAX} deportistas: guardá en tandas (dejá vacíos a los que todavía no mediste).</Alert>
      )}
      {restored && (
        <Alert tone="info">
          Recuperamos lo que habías cargado en esta planilla.{" "}
          <button onClick={discard} className="font-medium underline">
            Descartar
          </button>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-stone-700">
          <span className="mb-1 block text-xs text-stone-500">Fecha de la medición</span>
          <Input type="date" value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} className="w-auto" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={kerrBlock} onChange={(e) => setKerrBlock(e.target.checked)} />
          Bloque de Kerr
        </label>
        <div role="tablist" aria-label="Pasada" className="flex rounded-lg border border-stone-200 bg-surface p-0.5">
          {passes.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={pass === p.id}
              onClick={() => setPass(p.id)}
              className={cn(
                "flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm transition",
                pass === p.id ? "bg-brand text-brand-fg" : "text-stone-600 hover:bg-stone-100",
              )}
            >
              {p.label}
              {p.badge ? (
                <span className={cn("rounded-full px-1.5 text-xs", pass === p.id ? "bg-white/25" : "bg-amber-100 text-amber-800")}>{p.badge}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-stone-500">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {pass === 2
          ? pendingThird.length
            ? "Sólo se habilitan los sitios donde las dos primeras tomas difieren más de 5% (pliegues) o 1% (el resto)."
            : "No falta ninguna tercera toma."
          : "Enter baja al siguiente deportista en el mismo sitio; Tab avanza al sitio siguiente."}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-surface shadow-sm">
        <table className="text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-xs text-stone-500">
              <th className="sticky left-0 z-10 min-w-[7.5rem] bg-stone-50 px-3 sm:min-w-[11rem] sm:px-4 py-2 text-left font-medium">Deportista</th>
              {sites.map((s) => (
                <th key={s.key} className="min-w-[4.75rem] px-1.5 py-2 text-center font-medium leading-tight" title={s.label}>
                  <span className="block">{s.label.replace(/ \(.*\)$/, "")}</span>
                  <span className="font-normal text-stone-400">{s.unit}</span>
                </th>
              ))}
              <th className="min-w-[4.5rem] px-3 py-2 text-right font-medium">Σ6</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {members.map((m, rowIdx) => {
              const row = draft[m.patientId];
              const sex = m.sex === "female" || m.sex === "male" ? m.sex : null;
              const preview = anthropometryResults(rowTakes(row, kerrBlock), { sex, ageYears: ageAt(m.birthDate, measuredAt) });
              return (
                <tr key={m.patientId}>
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left font-medium leading-tight text-stone-800 sm:px-4">
                    {m.fullName}
                  </th>
                  {sites.map((s) => {
                    const raw = row?.[s.key];
                    const value = raw?.[pass] ?? "";
                    const can = editable(m.patientId, s.key);
                    const wantsThird = pass === 2 && needsThirdTake(s.key, firstTwo(raw)) && !value.trim();
                    return (
                      <td key={s.key} className="px-1 py-1">
                        <input
                          ref={(el) => {
                            const k = `${m.patientId}:${s.key}`;
                            if (el) cells.current.set(k, el);
                            else cells.current.delete(k);
                          }}
                          inputMode="decimal"
                          value={can ? value : pass === 1 && SINGLE.includes(s.key) ? (raw?.[0] ?? "") : ""}
                          disabled={!can}
                          onChange={(e) => set(m.patientId, s.key, pass, e.target.value)}
                          onKeyDown={(e) => onKey(e, rowIdx, s.key)}
                          aria-label={`${m.fullName}, ${s.label}, toma ${pass + 1}`}
                          className={cn(
                            "h-9 w-full min-w-0 rounded-md border px-1.5 text-right tabular-nums outline-none focus:border-brand focus:ring-2 focus:ring-brand/20",
                            can ? "border-stone-200 bg-surface" : "border-transparent bg-stone-50 text-stone-400",
                            wantsThird && "border-amber-400 bg-amber-50",
                            can && outOfRange(s.key, value) && "border-red-400 bg-red-50",
                          )}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right tabular-nums text-stone-600">{fmt(val(preview.sum6))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {saveErr && <Alert>{saveErr}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-500">
          {loadedCount} de {members.length} con datos
        </p>
        <div className="flex gap-2">
          {Object.keys(draft).length > 0 && (
            <Button variant="ghost" onClick={discard}>
              Descartar
            </Button>
          )}
          <Button onClick={save} disabled={busy || loadedCount === 0}>
            {busy ? "Guardando…" : "Guardar mediciones"}
          </Button>
        </div>
      </div>
    </div>
  );
}
