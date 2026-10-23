"use client";

import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACTIVITIES,
  MACRO_REFERENCE,
  REE_FORMULA_LABEL,
  energyResults,
  reeFormulas,
  weekdays,
  type EnergyContextDto,
  type EnergyDayType,
  type EnergyRequirementDto,
  type EnergyResults,
  type EnergySession,
  type ReeFormula,
  type SaveEnergyDto,
  type SourcedValue,
  type Weekday,
  dayKind,
} from "@nutreitor/shared";

import { Alert, Button, Card, EmptyState, Input, Loading, SectionHeading, Select, Textarea, cn } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

import { fmt, fmtMeasured, parseDecimal } from "./anthro-format";
import { WeekStrip } from "./week-strip";

const WEEKDAY_SHORT: Record<Weekday, string> = { mon: "Lun", tue: "Mar", wed: "Mié", thu: "Jue", fri: "Vie", sat: "Sáb", sun: "Dom" };

const ACTIVITY_FACTORS = [
  { value: 1.2, label: "1,2 · sedentaria (oficina, estudio)" },
  { value: 1.4, label: "1,4 · ligera (de pie parte del día)" },
  { value: 1.6, label: "1,6 · activa (trabajo físico)" },
];

const SOURCE_LABEL: Record<SourcedValue["source"], string> = {
  anthropometry: "antropometría",
  metric: "evolución",
  record: "ficha",
};

const newId = () => Math.random().toString(36).slice(2, 8);

const DEFAULT_DAYS = (): EnergyDayType[] => [
  { id: newId(), name: "Entrenamiento", choGPerKg: 5, proGPerKg: 1.6, sessions: [{ activity: "strength_vigorous", minutes: 60 }] },
  { id: newId(), name: "Descanso", choGPerKg: 3, proGPerKg: 1.6, sessions: [] },
];

/**
 * Requerimiento energético con periodización (ADR 0032): GER por fórmula × factor de
 * actividad + gasto de las sesiones de cada tipo de día; CHO y PRO en g/kg, la grasa
 * es el resto. Cada guardado es una versión; la de arriba es la vigente y el plan la
 * trae como objetivo.
 */
export function EnergyPanel({ patientId, canWrite }: { patientId: string; canWrite: boolean }) {
  const [list, setList] = useState<EnergyRequirementDto[] | null>(null);
  const [ctx, setCtx] = useState<EnergyContextDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([
        api<EnergyRequirementDto[]>(`patients/${patientId}/energy`),
        api<EnergyContextDto>(`patients/${patientId}/energy/context`),
      ]);
      setList(l);
      setCtx(c);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!list || !ctx) return <Loading />;
  const current = list[0] ?? null;

  if (editing) {
    return (
      <EnergyEditor
        patientId={patientId}
        ctx={ctx}
        initial={current}
        onCancel={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          await load();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {!current ? (
        <Card>
          <EmptyState
            action={
              canWrite && (
                <Button onClick={() => setEditing(true)}>
                  <Plus className="h-4 w-4" aria-hidden /> Calcular requerimiento
                </Button>
              )
            }
          >
            Calculá el gasto energético y los objetivos de macros por tipo de día (entrenamiento, partido, descanso). Después el
            plan los trae como objetivo.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stone-500">
              Vigente desde el {fmtMeasured(current.createdAt.slice(0, 10))}
              {current.createdByName ? ` · ${current.createdByName}` : ""}
            </p>
            {canWrite && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Ajustar requerimiento
              </Button>
            )}
          </div>
          <ResultsView inputs={current} results={current.results} />
          {current.note && <p className="whitespace-pre-line text-sm text-stone-600">{current.note}</p>}
        </>
      )}

      {list.length > 1 && (
        <Card>
          <SectionHeading>Versiones anteriores</SectionHeading>
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {list.slice(1).map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-stone-700">
                  {fmtMeasured(r.createdAt.slice(0, 10))}
                  {r.createdByName ? ` · ${r.createdByName}` : ""}
                </span>
                <span className="text-xs text-stone-500">
                  {r.weightKg} kg ·{" "}
                  {r.results.days.ok ? r.results.days.value.map((d) => `${d.name} ${d.targetKcal} kcal`).join(" · ") : "sin cálculo"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Resultados: GER y su comparación, y una fila por tipo de día. */
function ResultsView({ inputs, results }: { inputs: Omit<SaveEnergyDto, "note">; results: EnergyResults }) {
  const days = results.days.ok ? results.days.value : null;
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-stone-500">Gasto en reposo</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-stone-900">
              {results.ree.ok ? `${results.ree.value} kcal` : "—"}
            </p>
            <p className="text-xs text-stone-500">{REE_FORMULA_LABEL[inputs.formula]}</p>
          </div>
          <div className="text-sm text-stone-600">
            <p>
              Peso {fmt(inputs.weightKg)} kg{inputs.heightCm ? ` · talla ${fmt(inputs.heightCm)} cm` : ""}
              {inputs.ffmKg ? ` · MLG ${fmt(inputs.ffmKg)} kg` : ""}
            </p>
            <p>
              Factor de actividad {fmt(inputs.activityFactor)}
              {inputs.adjustmentPct ? ` · ajuste ${inputs.adjustmentPct > 0 ? "+" : ""}${inputs.adjustmentPct} %` : ""}
            </p>
          </div>
          <ul className="space-y-0.5 text-xs text-stone-500">
            {reeFormulas.map((f) => {
              const r = results.allRee[f];
              return (
                <li key={f} className={cn("flex justify-between gap-2", f === inputs.formula && "font-medium text-stone-800")}>
                  <span>{REE_FORMULA_LABEL[f].replace(/ \(.*$/, "")}</span>
                  <span className="tabular-nums" title={r.ok ? undefined : r.reason}>
                    {r.ok ? `${r.value} kcal` : "no aplica"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        {!results.ree.ok && <Alert className="mt-3">{results.ree.reason}</Alert>}
      </Card>

      {days && (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs text-stone-500">
                  <th className="px-5 py-2 font-medium">Tipo de día</th>
                  <th className="px-3 py-2 text-right font-medium">Base + sesiones</th>
                  <th className="px-3 py-2 text-right font-medium">Objetivo</th>
                  <th className="px-3 py-2 text-right font-medium">CHO</th>
                  <th className="px-3 py-2 text-right font-medium">PRO</th>
                  <th className="px-3 py-2 text-right font-medium">Grasa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {days.map((d) => {
                  const def = inputs.dayTypes.find((x) => x.id === d.id)!;
                  return (
                    <tr key={d.id} className="align-top">
                      <td className="px-5 py-3">
                        <p className="font-medium text-stone-900">{d.name}</p>
                        {d.warnings.map((w) => (
                          <p key={w} className="mt-1 flex items-start gap-1 text-xs text-amber-700">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {w}
                          </p>
                        ))}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-stone-600">
                        {d.baseKcal} + {d.exerciseKcal}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-stone-900">{d.targetKcal} kcal</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {d.choG} g<span className="block text-xs text-stone-500">{fmt(def.choGPerKg)} g/kg · {d.choPct} %</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {d.proG} g<span className="block text-xs text-stone-500">{fmt(def.proGPerKg)} g/kg · {d.proPct} %</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {d.fatG} g<span className="block text-xs text-stone-500">{fmt(d.fatGPerKg)} g/kg · {d.fatPct} %</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {Object.keys(inputs.week).length > 0 && (
            <div className="border-t border-stone-100 px-5 py-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-sm font-semibold uppercase tracking-wider text-stone-500">Semana tipo</p>
                {results.weekAvgKcal !== null && (
                  <p className="text-sm text-stone-600">
                    Promedio <span className="font-display text-lg font-bold tabular-nums text-stone-900">{results.weekAvgKcal.toLocaleString("es-AR")}</span> kcal/día
                  </p>
                )}
              </div>
              <WeekStrip
                days={weekdays.flatMap((wd) => {
                  const d = days.find((x) => x.id === inputs.week[wd]);
                  const def = inputs.dayTypes.find((x) => x.id === inputs.week[wd]);
                  return d
                    ? [{ weekday: wd, label: d.name, kind: dayKind(d.name, def?.sessions.length), kcal: d.targetKcal, choG: d.choG }]
                    : [];
                })}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────

type NumField = string;

function EnergyEditor({
  patientId,
  ctx,
  initial,
  onCancel,
  onSaved,
}: {
  patientId: string;
  ctx: EnergyContextDto;
  initial: EnergyRequirementDto | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const str = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
  // Peso, talla y MLG: los de la medición más reciente (no los de la versión anterior).
  const [weight, setWeight] = useState<NumField>(str(ctx.weightKg?.value ?? initial?.weightKg));
  const [height, setHeight] = useState<NumField>(str(ctx.heightCm?.value ?? initial?.heightCm));
  const [ffm, setFfm] = useState<NumField>(str(ctx.ffmKg?.value ?? initial?.ffmKg));
  const [formula, setFormula] = useState<ReeFormula>(initial?.formula ?? (ctx.ffmKg ? "cunningham" : "mifflin"));
  const [factor, setFactor] = useState<NumField>(str(initial?.activityFactor ?? 1.4));
  const [adjust, setAdjust] = useState<NumField>(str(initial?.adjustmentPct ?? 0));
  const [dayTypes, setDayTypes] = useState<EnergyDayType[]>(initial?.dayTypes ?? DEFAULT_DAYS());
  const [week, setWeek] = useState<Partial<Record<Weekday, string>>>(initial?.week ?? {});
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inputs = useMemo(
    () => ({
      formula,
      activityFactor: parseDecimal(factor) ?? 1,
      adjustmentPct: parseDecimal(adjust) ?? 0,
      weightKg: parseDecimal(weight) ?? 0,
      heightCm: parseDecimal(height),
      ffmKg: parseDecimal(ffm),
      dayTypes,
      week: Object.fromEntries(Object.entries(week).filter(([, id]) => id && dayTypes.some((d) => d.id === id))) as Partial<Record<Weekday, string>>,
    }),
    [formula, factor, adjust, weight, height, ffm, dayTypes, week],
  );
  const preview = useMemo(
    () =>
      energyResults(inputs, {
        sex: ctx.sex,
        ageYears: ctx.ageYears,
        weightKg: inputs.weightKg || null,
        heightCm: inputs.heightCm,
        ffmKg: inputs.ffmKg,
      }),
    [inputs, ctx],
  );

  function patchDay(id: string, patch: Partial<EnergyDayType>) {
    setDayTypes((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function patchSession(dayId: string, i: number, patch: Partial<EnergySession>) {
    setDayTypes((ds) =>
      ds.map((d) => (d.id === dayId ? { ...d, sessions: d.sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d)),
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!inputs.weightKg) return setErr("Falta el peso.");
    setBusy(true);
    try {
      await api(`patients/${patientId}/energy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...inputs, note: note.trim() || null }),
      });
      await onSaved();
    } catch (e2) {
      setErr(errorMessage(e2));
      setBusy(false);
    }
  }

  const sourced = (v: SourcedValue | null) =>
    v ? `De ${SOURCE_LABEL[v.source]}${v.date ? ` (${fmtMeasured(v.date)})` : ""}` : "Sin dato: cargalo";

  return (
    <form onSubmit={save} className="space-y-5">
      <Card>
        <SectionHeading>Gasto en reposo</SectionHeading>
        <p className="mt-1 text-sm text-stone-500">
          {[ctx.sex === "female" ? "Mujer" : ctx.sex === "male" ? "Varón" : "Sexo no binario en la ficha", ctx.ageYears != null ? `${ctx.ageYears} años` : "sin fecha de nacimiento"].join(" · ")}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <NumberField label="Peso (kg)" value={weight} onChange={setWeight} hint={sourced(ctx.weightKg)} />
          <NumberField label="Talla (cm)" value={height} onChange={setHeight} hint={sourced(ctx.heightCm)} />
          <NumberField label="Masa libre de grasa (kg)" value={ffm} onChange={setFfm} hint={ctx.ffmKg ? sourced(ctx.ffmKg) : "Opcional: la usa Cunningham"} />
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-stone-800">Fórmula</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {reeFormulas.map((f) => {
              const r = preview.allRee[f];
              return (
                <label
                  key={f}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
                    formula === f ? "border-brand bg-brand/5" : "border-stone-200",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="formula" checked={formula === f} onChange={() => setFormula(f)} />
                    {REE_FORMULA_LABEL[f]}
                  </span>
                  <span className="shrink-0 tabular-nums text-stone-600" title={r.ok ? undefined : r.reason}>
                    {r.ok ? `${r.value} kcal` : "no aplica"}
                  </span>
                </label>
              );
            })}
          </div>
          {!preview.ree.ok && <p className="mt-2 text-xs text-amber-700">{preview.ree.reason}</p>}
        </fieldset>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-stone-500">Factor de actividad sin el entrenamiento</span>
            <Input list="energy-factors" value={factor} onChange={(e) => setFactor(e.target.value)} inputMode="decimal" />
            <datalist id="energy-factors">
              {ACTIVITY_FACTORS.map((f) => (
                <option key={f.value} value={String(f.value).replace(".", ",")}>
                  {f.label}
                </option>
              ))}
            </datalist>
            <span className="mt-1 block text-xs text-stone-500">1,2 sedentaria · 1,4 ligera · 1,6 activa. El entrenamiento se suma aparte.</span>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-stone-500">Ajuste del objetivo (%)</span>
            <Input value={adjust} onChange={(e) => setAdjust(e.target.value)} inputMode="decimal" />
            <span className="mt-1 block text-xs text-stone-500">−10 = déficit del 10 % · +5 = superávit. 0 = mantenimiento.</span>
          </label>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading>Tipos de día</SectionHeading>
          {dayTypes.length < 7 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDayTypes((ds) => [...ds, { id: newId(), name: "Partido", choGPerKg: 7, proGPerKg: 1.6, sessions: [] }])}
            >
              <Plus className="h-4 w-4" aria-hidden /> Tipo de día
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-stone-500">
          CHO de referencia (ACSM 2016):{" "}
          {MACRO_REFERENCE.cho.map((c) => `${c.label.toLowerCase()} ${c.min}–${c.max}`).join(" · ")} g/kg. PRO {MACRO_REFERENCE.pro.min}–
          {MACRO_REFERENCE.pro.max} g/kg. La grasa es el resto (referencia {MACRO_REFERENCE.fatPct.min}–{MACRO_REFERENCE.fatPct.max} %).
        </p>
        <div className="mt-4 space-y-4">
          {dayTypes.map((d) => {
            const r = preview.days.ok ? preview.days.value.find((x) => x.id === d.id) : undefined;
            return (
              <div key={d.id} className="rounded-xl border border-stone-200 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-[10rem] flex-1 text-sm">
                    <span className="mb-1 block text-xs text-stone-500">Nombre</span>
                    <Input value={d.name} onChange={(e) => patchDay(d.id, { name: e.target.value })} maxLength={40} aria-label="Nombre del tipo de día" />
                  </label>
                  <label className="w-24 text-sm">
                    <span className="mb-1 block text-xs text-stone-500">CHO g/kg</span>
                    <Input
                      inputMode="decimal"
                      defaultValue={str(d.choGPerKg)}
                      onChange={(e) => patchDay(d.id, { choGPerKg: parseDecimal(e.target.value) ?? 0 })}
                      aria-label={`${d.name}: carbohidratos g/kg`}
                    />
                  </label>
                  <label className="w-24 text-sm">
                    <span className="mb-1 block text-xs text-stone-500">PRO g/kg</span>
                    <Input
                      inputMode="decimal"
                      defaultValue={str(d.proGPerKg)}
                      onChange={(e) => patchDay(d.id, { proGPerKg: parseDecimal(e.target.value) ?? 0 })}
                      aria-label={`${d.name}: proteínas g/kg`}
                    />
                  </label>
                  {dayTypes.length > 1 && (
                    <Button variant="danger" size="sm" onClick={() => setDayTypes((ds) => ds.filter((x) => x.id !== d.id))} aria-label={`Quitar ${d.name}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {d.sessions.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Select
                        value={s.activity}
                        onChange={(e) => patchSession(d.id, i, { activity: e.target.value as EnergySession["activity"] })}
                        className="min-w-0 flex-1"
                        aria-label={`${d.name}: actividad ${i + 1}`}
                      >
                        {ACTIVITIES.map((a) => (
                          <option key={a.key} value={a.key}>
                            {a.label} · {String(a.met).replace(".", ",")} MET
                          </option>
                        ))}
                        <option value="custom">Otra (MET propio)</option>
                      </Select>
                      {s.activity === "custom" && (
                        <Input
                          className="w-20"
                          inputMode="decimal"
                          placeholder="MET"
                          defaultValue={str(s.met)}
                          onChange={(e) => patchSession(d.id, i, { met: parseDecimal(e.target.value) })}
                          aria-label={`${d.name}: MET de la actividad ${i + 1}`}
                        />
                      )}
                      <Input
                        className="w-20"
                        inputMode="numeric"
                        defaultValue={String(s.minutes)}
                        onChange={(e) => patchSession(d.id, i, { minutes: Math.round(parseDecimal(e.target.value) ?? 0) })}
                        aria-label={`${d.name}: minutos de la actividad ${i + 1}`}
                      />
                      <span className="text-xs text-stone-500">min</span>
                      <button
                        type="button"
                        onClick={() => patchDay(d.id, { sessions: d.sessions.filter((_, j) => j !== i) })}
                        className="rounded p-1 text-stone-400 hover:text-red-600"
                        aria-label={`Quitar la actividad ${i + 1}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  ))}
                  {d.sessions.length < 6 && (
                    <button
                      type="button"
                      onClick={() => patchDay(d.id, { sessions: [...d.sessions, { activity: "football_training", minutes: 60 }] })}
                      className="text-xs text-stone-500 hover:text-brand"
                    >
                      + Sesión
                    </button>
                  )}
                </div>

                {r && (
                  <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
                    <strong className="tabular-nums">{r.targetKcal} kcal</strong> ({r.baseKcal} base + {r.exerciseKcal} sesiones) · CHO {r.choG} g ·
                    PRO {r.proG} g · Grasa {r.fatG} g ({r.fatPct} %)
                    {r.warnings.map((w) => (
                      <span key={w} className="mt-1 block text-xs text-amber-700">
                        {w}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionHeading>Semana tipo (opcional)</SectionHeading>
        <p className="mt-1 text-xs text-stone-500">Qué tipo de día es cada día. Un plan semanal la toma como objetivo de cada día.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {weekdays.map((wd) => (
            <label key={wd} className="text-sm">
              <span className="mb-1 block text-xs text-stone-500">{WEEKDAY_SHORT[wd]}</span>
              <Select aria-label={WEEKDAY_SHORT[wd]} value={week[wd] ?? ""} onChange={(e) => setWeek((w) => ({ ...w, [wd]: e.target.value || undefined }))}>
                <option value="">—</option>
                {dayTypes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </label>
          ))}
        </div>
        {preview.weekAvgKcal !== null && <p className="mt-3 text-sm text-stone-700">Promedio semanal: {preview.weekAvgKcal} kcal/día</p>}
      </Card>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-stone-500">Nota (opcional)</span>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Pretemporada, objetivo de recomposición…" />
      </label>

      {err && <Alert>{err}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar requerimiento"}
        </Button>
      </div>
    </form>
  );
}

function NumberField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs text-stone-500">{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" />
      <span className="mt-1 block text-xs text-stone-500">{hint}</span>
    </label>
  );
}
