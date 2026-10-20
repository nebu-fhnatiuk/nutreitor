"use client";

import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dayTypeTargets,
  recallTotals,
  sumMacros,
  type DayTypeResult,
  type EnergyContextDto,
  type EnergyRequirementDto,
  type Macros,
  type PlanMeal,
  type RecallDto,
} from "@nutreitor/shared";

import { Alert, Button, Card, EmptyState, Input, Loading, SectionHeading, Select, Textarea, Toggle, cn, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

import { fmt, fmtMeasured } from "./anthro-format";
import { DayTotals, MealsEditor, cleanMeal, nonEmptyMeal } from "./meal-plan-panel";

/** Momentos de ingesta con los que arranca un recordatorio (se borran los que no van). */
const DEFAULT_OCCASIONS = ["Desayuno", "Media mañana", "Almuerzo", "Merienda", "Cena"];

/** Segunda pasada del método de pasadas múltiples: lo que más se olvida. */
const FORGOTTEN = [
  "Bebidas: agua, gaseosas, jugos, alcohol",
  "Infusiones y lo que les agrega (azúcar, leche)",
  "Aceite, manteca, aderezos y salsas",
  "Picoteos entre comidas",
  "Antes, durante y después del entrenamiento",
  "Suplementos, geles y bebidas deportivas",
];

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA");
};

/**
 * Ingesta del deportista (ADR 0033): recordatorios de 24 h con la base de alimentos,
 * comparados contra el requerimiento vigente del tipo de día. El promedio de los días
 * habituales es lo que describe la dieta.
 */
export function IntakePanel({ patientId, canWrite }: { patientId: string; canWrite: boolean }) {
  const { confirm, toast } = useFeedback();
  const [recalls, setRecalls] = useState<RecallDto[] | null>(null);
  const [req, setReq] = useState<EnergyRequirementDto | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecallDto | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, e, c] = await Promise.all([
        api<RecallDto[]>(`patients/${patientId}/recalls`),
        api<EnergyRequirementDto[]>(`patients/${patientId}/energy`).catch(() => []),
        api<EnergyContextDto>(`patients/${patientId}/energy/context`).catch(() => null),
      ]);
      setRecalls(r);
      setReq(e[0] ?? null);
      setWeightKg(c?.weightKg?.value ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayTypes: DayTypeResult[] = req?.results.days.ok ? req.results.days.value : [];
  const targetsFor = (label: string | null | undefined): Macros | undefined => {
    const d = dayTypes.find((x) => x.name === label);
    return d ? dayTypeTargets(d) : undefined;
  };

  async function remove(r: RecallDto) {
    const ok = await confirm({ title: "¿Borrar este recordatorio?", body: `El del ${fmtMeasured(r.recalledDate)}.`, confirmLabel: "Borrar", tone: "danger" });
    if (!ok) return;
    try {
      await api(`patients/${patientId}/recalls/${r.id}`, { method: "DELETE" });
      toast("Recordatorio borrado");
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!recalls) return <Loading />;

  if (editing) {
    return (
      <RecallEditor
        patientId={patientId}
        initial={editing === "new" ? null : editing}
        dayTypes={dayTypes}
        targetsFor={targetsFor}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          toast("Recordatorio guardado");
          await load();
        }}
      />
    );
  }

  const typical = recalls.filter((r) => r.typical && r.totals.macros?.kcal != null);
  const avg = typical.length >= 2 ? averageMacros(typical.map((r) => r.totals.macros!)) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionHeading>Recordatorios de 24 h</SectionHeading>
          <p className="mt-1 text-sm text-stone-500">
            Lo que comió y tomó un día. Con dos o más días habituales, el promedio describe su alimentación.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> Nuevo recordatorio
          </Button>
        )}
      </div>

      {avg && (
        <Card>
          <SectionHeading>Promedio de {typical.length} días habituales</SectionHeading>
          <MacroSummary macros={avg} weightKg={weightKg} />
        </Card>
      )}

      {recalls.length === 0 ? (
        <Card>
          <EmptyState>
            Todavía no hay recordatorios. Cargá el de ayer en la consulta: primero la lista rápida de todo lo que comió, después
            lo que suele olvidarse y por último cantidades y horarios.
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3">
          {recalls.map((r) => (
            <RecallCard
              key={r.id}
              recall={r}
              weightKg={weightKg}
              targets={targetsFor(r.dayLabel)}
              canWrite={canWrite}
              onEdit={() => setEditing(r)}
              onRemove={() => remove(r)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function averageMacros(list: Macros[]): Macros {
  const n = list.length;
  const s = sumMacros(list) ?? {};
  const avg = (v: number | undefined) => (v == null ? undefined : Math.round(v / n));
  return { kcal: avg(s.kcal), protein_g: avg(s.protein_g), carbs_g: avg(s.carbs_g), fat_g: avg(s.fat_g) };
}

/** kcal y macros con g/kg y % de la energía. */
function MacroSummary({ macros, weightKg }: { macros: Macros; weightKg: number | null }) {
  const kcal = macros.kcal ?? 0;
  const row = (label: string, g: number | undefined, kcalPerG: number) =>
    g == null ? null : (
      <div>
        <dt className="text-xs text-stone-500">{label}</dt>
        <dd className="font-semibold tabular-nums text-stone-900">{Math.round(g)} g</dd>
        <dd className="text-xs tabular-nums text-stone-500">
          {weightKg ? `${fmt(g / weightKg)} g/kg · ` : ""}
          {kcal > 0 ? `${Math.round(((g * kcalPerG) / kcal) * 100)} %` : ""}
        </dd>
      </div>
    );
  return (
    <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div>
        <dt className="text-xs text-stone-500">Energía</dt>
        <dd className="font-semibold tabular-nums text-stone-900">{macros.kcal != null ? `${Math.round(macros.kcal)} kcal` : "—"}</dd>
        {weightKg && macros.kcal != null && <dd className="text-xs tabular-nums text-stone-500">{fmt(macros.kcal / weightKg)} kcal/kg</dd>}
      </div>
      {row("Carbohidratos", macros.carbs_g, 4)}
      {row("Proteínas", macros.protein_g, 4)}
      {row("Grasas", macros.fat_g, 9)}
    </dl>
  );
}

function RecallCard({
  recall: r,
  weightKg,
  targets,
  canWrite,
  onEdit,
  onRemove,
}: {
  recall: RecallDto;
  weightKg: number | null;
  targets: Macros | undefined;
  canWrite: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const t = r.totals;
  const maxKcal = Math.max(1, ...t.byMeal.map((m) => m.kcal ?? 0));
  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-stone-900">{fmtMeasured(r.recalledDate)}</p>
            <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
              <span className={cn("rounded-full px-2 py-0.5", r.typical ? "bg-brand/10 text-brand" : "bg-amber-100 text-amber-800")}>
                {r.typical ? "Día habitual" : "Día atípico"}
              </span>
              {r.dayLabel && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">{r.dayLabel}</span>}
              {r.recordedByName && <span className="text-stone-500">{r.recordedByName}</span>}
            </p>
          </div>
          {canWrite && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Editar recordatorio">
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
              <Button variant="danger" size="sm" onClick={onRemove} aria-label="Borrar recordatorio">
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}
        </div>

        {t.macros && <MacroSummary macros={t.macros} weightKg={weightKg} />}
        {t.itemsWithoutMacros > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            Total parcial: {t.itemsWithoutMacros} de {t.items} items sin vincular a la base de alimentos.
          </p>
        )}
        {targets && t.macros && t.itemsWithoutMacros === 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-stone-500">Contra el requerimiento de un día de {r.dayLabel?.toLowerCase()}:</p>
            <DayTotals meals={r.meals} targets={targets} />
          </div>
        )}
        {targets && t.itemsWithoutMacros > 0 && (
          <p className="mt-1 text-xs text-stone-500">
            Vinculá todos los items para compararlo con el requerimiento de un día de {r.dayLabel?.toLowerCase()} ({targets.kcal} kcal).
          </p>
        )}

        <div className="mt-4 space-y-1.5">
          {t.byMeal.map((m, i) => (
            <div key={i} className="grid grid-cols-[8rem_minmax(0,1fr)_4rem] items-center gap-2 text-xs sm:grid-cols-[11rem_minmax(0,1fr)_4.5rem]">
              <span className="truncate text-stone-600">{m.name}</span>
              <span className="h-2 rounded-full bg-stone-100">
                <span className="block h-2 rounded-full bg-brand/60" style={{ width: `${((m.kcal ?? 0) / maxKcal) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums text-stone-600">{m.kcal != null ? `${Math.round(m.kcal)} kcal` : "—"}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-3 inline-flex items-center gap-1 text-xs text-stone-500 hover:text-brand"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} aria-hidden /> {open ? "Ocultar" : "Ver"} lo que comió
        </button>
        {open && (
          <div className="mt-2 space-y-2 text-sm">
            {r.meals.map((m, i) => (
              <div key={i}>
                <p className="font-medium text-stone-800">
                  {m.name}
                  {m.time && <span className="ml-2 text-xs font-normal text-stone-500">{m.time}</span>}
                </p>
                <ul className="pl-3 text-stone-700">
                  {m.items.map((it, j) => (
                    <li key={j}>
                      · {it.food ? `${Math.round(it.food.grams)} g ` : it.qty != null ? `${it.qty} ${it.unit ?? ""} ` : ""}
                      {it.text}
                      {it.note && <span className="text-stone-500"> — {it.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {r.note && <p className="whitespace-pre-line text-stone-600">{r.note}</p>}
          </div>
        )}
      </Card>
    </li>
  );
}

function RecallEditor({
  patientId,
  initial,
  dayTypes,
  targetsFor,
  onCancel,
  onSaved,
}: {
  patientId: string;
  initial: RecallDto | null;
  dayTypes: DayTypeResult[];
  targetsFor: (label: string | null | undefined) => Macros | undefined;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [recalledDate, setRecalledDate] = useState(initial?.recalledDate ?? yesterday());
  const [typical, setTypical] = useState(initial?.typical ?? true);
  const [dayLabel, setDayLabel] = useState(initial?.dayLabel ?? "");
  const [meals, setMeals] = useState<PlanMeal[]>(
    initial?.meals ?? DEFAULT_OCCASIONS.map((name) => ({ name, items: [{ text: "" }] })),
  );
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cleaned = useMemo(() => meals.map(cleanMeal).filter(nonEmptyMeal), [meals]);
  const totals = recallTotals(cleaned);
  const labels = [...new Set([...dayTypes.map((d) => d.name), ...(initial?.dayLabel ? [initial.dayLabel] : [])])];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (cleaned.length === 0) return setErr("Cargá al menos una comida con algo adentro.");
    setBusy(true);
    try {
      await api(`patients/${patientId}/recalls${initial ? `/${initial.id}` : ""}`, {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recalledDate, typical, dayLabel: dayLabel || null, meals: cleaned, note: note.trim() || null }),
      });
      await onSaved();
    } catch (e2) {
      setErr(errorMessage(e2));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Card>
        <SectionHeading>{initial ? "Editar recordatorio" : "Nuevo recordatorio de 24 h"}</SectionHeading>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-stone-500">Día que recuerda</span>
            <Input type="date" value={recalledDate} onChange={(e) => setRecalledDate(e.target.value)} required className="w-auto" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-stone-500">Tipo de día</span>
            <Select value={dayLabel} onChange={(e) => setDayLabel(e.target.value)} className="w-auto" aria-label="Tipo de día">
              <option value="">Sin especificar</option>
              {labels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex min-h-11 items-center gap-2 text-sm text-stone-700">
            <Toggle on={typical} onChange={() => setTypical((t) => !t)} label="Fue un día habitual" />
            Fue un día habitual
          </div>
        </div>
        {labels.length === 0 && (
          <p className="mt-2 text-xs text-stone-500">Con un requerimiento cargado, el recordatorio se compara contra el objetivo del tipo de día.</p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-3">
          <p className="text-xs text-stone-500">
            1ª pasada: la lista rápida de todo lo que comió y tomó. Después, cantidades (vinculá el alimento para que se calcule) y
            horarios.
          </p>
          <MealsEditor meals={meals} onChange={setMeals} variant="intake" />
          <DayTotals meals={cleaned} targets={targetsFor(dayLabel)} />
        </div>
        <Card as="div" className="h-fit lg:sticky lg:top-4">
          <p className="text-sm font-medium text-stone-800">2ª pasada: lo que suele olvidarse</p>
          <ul className="mt-2 space-y-1.5">
            {FORGOTTEN.map((f, i) => (
              <li key={f}>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked.has(i)}
                    onChange={() =>
                      setChecked((s) => {
                        const n = new Set(s);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                  />
                  <span className={cn(checked.has(i) && "text-stone-400 line-through")}>{f}</span>
                </label>
              </li>
            ))}
          </ul>
          {totals.items > 0 && (
            <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500">
              {totals.items} items · {totals.itemsWithoutMacros > 0 ? `${totals.itemsWithoutMacros} sin vincular` : "todos vinculados"}
            </p>
          )}
        </Card>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-stone-500">Nota (opcional)</span>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Comió afuera, día de viaje…" />
      </label>

      {err && <Alert>{err}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar recordatorio"}
        </Button>
      </div>
    </form>
  );
}
