"use client";

import { useCallback, useEffect, useState } from "react";
import {
  dayMacros,
  macrosForGrams,
  normalizeMealPlanBody,
  sumMacros,
  targetDeviation,
  weekdays,
  type DayPlan,
  type FoodDto,
  type FoodRef,
  type Macros,
  type MealItem,
  type MealPlanBody,
  type MealPlanDto,
  type PlanMeal,
  type Weekday,
} from "@nutreitor/shared";

import { api } from "@/lib/api";
import { FoodPicker } from "./food-picker";

const inputCls =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20";
const narrowCls =
  "rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20";
const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("es-AR") : null;

const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

/** Días con comidas de un body, normalizado para render (day → un día sin label). */
function daysOf(body: MealPlanBody): { key: string; label?: string; meals: PlanMeal[] }[] {
  if (body.layout === "week") {
    return weekdays
      .filter((d) => body.days[d])
      .map((d) => ({ key: d, label: WEEKDAY_LABEL[d], meals: body.days[d]!.meals }));
  }
  return [{ key: "day", meals: body.day.meals }];
}

/** Suma de macros de una comida (sólo claves cargadas; null si ningún item). */
const mealMacros = (meal: PlanMeal): Macros | null => sumMacros(meal.items.map((it) => it.macros));

function macroLine(m: Macros): string {
  const parts: string[] = [];
  if (m.protein_g != null) parts.push(`P ${round(m.protein_g)}`);
  if (m.carbs_g != null) parts.push(`C ${round(m.carbs_g)}`);
  if (m.fat_g != null) parts.push(`G ${round(m.fat_g)}`);
  if (m.kcal != null) parts.push(`${round(m.kcal)} kcal`);
  return parts.join(" · ");
}
const round = (n: number) => Math.round(n * 10) / 10;
const qtyText = (it: { qty?: number; unit?: string }) =>
  it.qty != null ? `${it.qty}${it.unit ? ` ${it.unit}` : ""}` : it.unit ?? "";

/**
 * Sección "Plan alimentario": muestra el plan ACTIVO, permite revisarlo (crea una
 * versión nueva), archivarlo, y ver el historial. El cuerpo es flexible por estilo
 * (layout día/semana + detalle opcional: cantidad, alternativas, macros).
 */
export function MealPlanPanel({
  patientId,
  canWrite,
}: {
  patientId: string;
  canWrite: boolean;
}) {
  const [plans, setPlans] = useState<MealPlanDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlans(await api<MealPlanDto[]>(`patients/${patientId}/plans`));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = plans.find((p) => p.status === "active") ?? null;
  const history = plans.filter((p) => p.status !== "active");

  async function archive() {
    setError(null);
    try {
      await api(`patients/${patientId}/plans/archive`, { method: "POST" });
      void load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          Plan alimentario
          {loading && <span className="ml-2 text-stone-400">cargando…</span>}
        </h2>
        {canWrite && !editing && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-brand-fg transition hover:brightness-110"
            >
              {active ? "Revisar plan" : "Crear plan"}
            </button>
            {active && (
              <button
                onClick={archive}
                className="rounded-lg px-3 py-1.5 text-sm text-stone-500 transition hover:bg-stone-100"
              >
                Archivar
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {editing ? (
        <PlanEditor
          initial={active}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
          onError={setError}
          patientId={patientId}
        />
      ) : active ? (
        <PlanView plan={active} />
      ) : (
        <p className="text-sm text-stone-400">
          Este paciente todavía no tiene un plan activo.
        </p>
      )}

      {history.length > 0 && !editing && (
        <div className="mt-5 border-t border-stone-100 pt-4">
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="text-xs font-medium text-stone-500 transition hover:text-brand"
          >
            {showHistory ? "Ocultar" : "Ver"} historial ({history.length})
          </button>
          {showHistory && (
            <ul className="mt-3 space-y-4">
              {history.map((p) => (
                <li key={p.id} className="rounded-xl border border-stone-100 p-3">
                  <PlanView plan={p} compact />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function PlanView({ plan, compact }: { plan: MealPlanDto; compact?: boolean }) {
  const start = fmtDate(plan.startDate);
  // Blindaje: normaliza por las dudas (body legacy o mal formado) antes de render.
  // La API ya normaliza, pero el read-path no debe romper ante cualquier shape.
  const body = normalizeMealPlanBody(plan.body) as MealPlanBody;
  const groups = daysOf(body);
  const empty = groups.every((g) => g.meals.length === 0);
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className={compact ? "font-medium text-stone-800" : "font-serif text-xl text-stone-900"}>
          {plan.title}
        </h3>
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs " +
            (plan.status === "active"
              ? "bg-brand/10 text-brand"
              : "bg-stone-100 text-stone-500")
          }
        >
          v{plan.version} · {plan.status === "active" ? "activo" : plan.status === "archived" ? "archivado" : "anterior"}
        </span>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
          {body.layout === "week" ? "semanal" : "día tipo"}
        </span>
        <span className="text-xs text-stone-400">
          {start ? `desde ${start} · ` : ""}
          {plan.authorName} · {new Date(plan.createdAt).toLocaleDateString("es-AR")}
        </span>
      </div>

      {body.targets && (
        <p className="mt-2 text-xs text-stone-500">
          <span className="uppercase tracking-widest text-stone-400">Objetivo</span>{" "}
          {macroLine(body.targets)}
        </p>
      )}

      <div className="mt-3 space-y-4">
        {empty && <p className="text-sm text-stone-400">Sin comidas cargadas.</p>}
        {groups.map((g) => (
          <div key={g.key} className={g.label ? "space-y-2" : "space-y-3"}>
            {g.label && (
              <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                {g.label}
              </p>
            )}
            {g.meals.map((meal, i) => {
              const totals = mealMacros(meal);
              return (
                <div key={i} className="rounded-xl border border-stone-100 p-3">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-stone-800">{meal.name}</span>
                      {meal.time && <span className="text-xs text-stone-400">{meal.time}</span>}
                    </div>
                    {totals && <span className="text-xs text-stone-400">{macroLine(totals)}</span>}
                  </div>
                  <ul className="space-y-1">
                    {meal.items.map((it, j) => (
                      <li key={j} className="text-sm text-stone-700">
                        · {qtyText(it) && <span className="text-stone-500">{qtyText(it)} </span>}
                        {it.text}
                        {it.food && it.food.portion && (
                          <span className="text-stone-400"> ({round(it.food.grams)} g)</span>
                        )}
                        {it.note && <span className="text-stone-400"> — {it.note}</span>}
                        {it.macros && (
                          <span className="ml-1 text-xs text-stone-400">({macroLine(it.macros)})</span>
                        )}
                        {it.alternatives && it.alternatives.length > 0 && (
                          <span className="block pl-4 text-xs text-stone-400">
                            o: {it.alternatives.map((a) => `${qtyText(a)} ${a.text}`.trim()).join(" · ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <DayTotals meals={g.meals} targets={body.targets} />
          </div>
        ))}
        {plan.body.generalNotes && (
          <p className="whitespace-pre-line text-sm text-stone-600">
            <span className="text-xs uppercase tracking-widest text-stone-400">Notas</span>
            <br />
            {plan.body.generalNotes}
          </p>
        )}
        <Attribution groups={groups} />
      </div>
    </div>
  );
}

/**
 * Total del día contra el objetivo del plan. Se marca el desvío de kcal y de cada
 * macro: ±10% está bien, más que eso se resalta. No se muestra si nada tiene macros.
 */
function DayTotals({ meals, targets }: { meals: PlanMeal[]; targets?: Macros }) {
  const total = dayMacros({ meals });
  if (!total) return null;
  const keys: [keyof Macros, string, string][] = [
    ["kcal", "kcal", ""],
    ["protein_g", "P", " g"],
    ["carbs_g", "C", " g"],
    ["fat_g", "G", " g"],
  ];
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg bg-stone-50 px-3 py-2 text-xs">
      <span className="font-semibold uppercase tracking-widest text-stone-400">Total del día</span>
      {keys.map(([k, label, unit]) => {
        const v = total[k];
        if (v == null) return null;
        const dev = targetDeviation(v, targets?.[k]);
        const off = dev != null && Math.abs(dev) > 10;
        return (
          <span key={k} className={off ? "font-medium text-amber-700" : "text-stone-600"}>
            {label} {round(v)}
            {unit}
            {targets?.[k] != null && (
              <span className="text-stone-400">
                {" "}
                / {round(targets[k]!)}
                {unit}
                {dev != null && dev !== 0 && ` (${dev > 0 ? "+" : ""}${dev}%)`}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Cita la fuente de los datos nutricionales si algún item viene de la base. */
function Attribution({ groups }: { groups: { meals: PlanMeal[] }[] }) {
  const sources = new Set(
    groups.flatMap((g) => g.meals.flatMap((m) => m.items.map((it) => it.food?.attribution))),
  );
  sources.delete(undefined);
  sources.delete(null);
  if (sources.size === 0) return null;
  return (
    <p className="text-[11px] text-stone-400">
      Datos nutricionales: {[...sources].join(", ")}.
    </p>
  );
}

// ── Editor (día-tipo o semanal) ─────────────────────────────────────────────

const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: "Lun",
  tue: "Mar",
  wed: "Mié",
  thu: "Jue",
  fri: "Vie",
  sat: "Sáb",
  sun: "Dom",
};

function emptyMeal(): PlanMeal {
  return { name: "", items: [{ text: "" }] };
}
const cloneMeal = (m: PlanMeal): PlanMeal => ({
  ...m,
  items: m.items.map((it) => ({ ...it, alternatives: it.alternatives?.map((a) => ({ ...a })) })),
});
const cloneMeals = (ms: PlanMeal[]): PlanMeal[] => ms.map(cloneMeal);
const emptyWeek = (): Record<Weekday, PlanMeal[]> =>
  Object.fromEntries(weekdays.map((d) => [d, [] as PlanMeal[]])) as Record<Weekday, PlanMeal[]>;

/** Estado inicial del editor desde el plan (o vacío). Mantiene AMBOS modos
 * poblados para que alternar layout no pierda lo cargado en la sesión. */
function initialEditorState(plan: MealPlanDto | null): {
  layout: "day" | "week";
  dayMeals: PlanMeal[];
  week: Record<Weekday, PlanMeal[]>;
} {
  if (!plan) return { layout: "day", dayMeals: [emptyMeal()], week: emptyWeek() };
  const body = normalizeMealPlanBody(plan.body) as MealPlanBody;
  if (body.layout === "week") {
    const week = emptyWeek();
    for (const d of weekdays) if (body.days[d]) week[d] = cloneMeals(body.days[d]!.meals);
    const seed = weekdays.map((d) => week[d]).find((m) => m.length > 0) ?? [];
    return {
      layout: "week",
      dayMeals: seed.length ? cloneMeals(seed) : [emptyMeal()],
      week,
    };
  }
  const meals = body.day.meals.length ? cloneMeals(body.day.meals) : [emptyMeal()];
  return { layout: "day", dayMeals: meals, week: emptyWeek() };
}

/** Selector de día de la semana. Marca con un punto los días que ya tienen carga. */
function WeekdayTabs({
  active,
  week,
  onSelect,
}: {
  active: Weekday;
  week: Record<Weekday, PlanMeal[]>;
  onSelect: (d: Weekday) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {weekdays.map((d) => {
        const has = (week[d] ?? []).some(
          (m) => m.name.trim() || m.items.some((it) => it.text.trim()),
        );
        const on = d === active;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelect(d)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              on ? "bg-brand text-brand-fg" : "border border-stone-200 text-stone-600 hover:border-stone-300"
            }`}
          >
            {WEEKDAY_SHORT[d]}
            {has && (
              <span
                className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${on ? "bg-brand-fg" : "bg-brand"}`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Editor de la lista de comidas de UN día. Reusado por el modo día y por cada
 * día del modo semana (recibe/emite el array completo). */
function MealsEditor({
  meals,
  onChange,
}: {
  meals: PlanMeal[];
  onChange: (m: PlanMeal[]) => void;
}) {
  const updateMeal = (i: number, patch: Partial<PlanMeal>) =>
    onChange(meals.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const updateItem = (mi: number, ii: number, patch: Partial<MealItem>) =>
    onChange(
      meals.map((m, j) =>
        j === mi
          ? { ...m, items: m.items.map((it, k) => (k === ii ? { ...it, ...patch } : it)) }
          : m,
      ),
    );
  return (
    <div className="space-y-3">
      {meals.map((meal, mi) => (
        <div key={mi} className="rounded-xl border border-stone-200 p-3">
          <div className="mb-2 flex gap-2">
            <input
              value={meal.name}
              onChange={(e) => updateMeal(mi, { name: e.target.value })}
              placeholder="Comida (ej. Desayuno)"
              className={inputCls}
            />
            <input
              value={meal.time ?? ""}
              onChange={(e) => updateMeal(mi, { time: e.target.value })}
              placeholder="Hora"
              className={`${narrowCls} w-24`}
            />
            <button
              type="button"
              onClick={() => onChange(meals.filter((_, j) => j !== mi))}
              className="shrink-0 rounded-lg px-2 text-sm text-stone-400 transition hover:text-red-600"
              aria-label="Quitar comida"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2 pl-1">
            {meal.items.map((it, ii) => (
              <ItemEditor
                key={ii}
                item={it}
                onChange={(patch) => updateItem(mi, ii, patch)}
                onRemove={() => updateMeal(mi, { items: meal.items.filter((_, k) => k !== ii) })}
              />
            ))}
            <button
              type="button"
              onClick={() => updateMeal(mi, { items: [...meal.items, { text: "" }] })}
              className="text-xs text-stone-500 transition hover:text-brand"
            >
              + Agregar item
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...meals, emptyMeal()])}
        className="rounded-lg border border-dashed border-stone-300 px-4 py-2 text-sm text-stone-500 transition hover:border-brand/50 hover:text-stone-700"
      >
        + Agregar comida
      </button>
    </div>
  );
}

function PlanEditor({
  initial,
  patientId,
  onCancel,
  onSaved,
  onError,
}: {
  initial: MealPlanDto | null;
  patientId: string;
  onCancel: () => void;
  onSaved: () => void;
  onError: (e: string) => void;
}) {
  const [model] = useState(() => initialEditorState(initial));
  const [layout, setLayout] = useState<"day" | "week">(model.layout);
  const [title, setTitle] = useState(initial?.title ?? "Plan alimentario");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [dayMeals, setDayMeals] = useState<PlanMeal[]>(model.dayMeals);
  const [week, setWeek] = useState<Record<Weekday, PlanMeal[]>>(model.week);
  const [activeDay, setActiveDay] = useState<Weekday>("mon");
  const [targets, setTargets] = useState<Macros>(initial?.body.targets ?? {});
  const [generalNotes, setGeneralNotes] = useState(initial?.body.generalNotes ?? "");
  const [busy, setBusy] = useState(false);

  /** Copia las comidas del día activo a los 7 días (atajo para armar la semana). */
  function copyDayToAll() {
    const src = week[activeDay] ?? [];
    setWeek(
      Object.fromEntries(weekdays.map((d) => [d, cloneMeals(src)])) as Record<Weekday, PlanMeal[]>,
    );
  }

  const hasContent = (ms: PlanMeal[]) =>
    ms.some((m) => m.name.trim() || m.items.some((it) => it.text.trim()));

  /** Cambia de layout. Al pasar a semana con la semana vacía, siembra el lunes con
   * lo cargado en el día-tipo (transición no destructiva, en vez de empezar de cero). */
  function chooseLayout(next: "day" | "week") {
    if (next === "week" && !weekdays.some((d) => hasContent(week[d] ?? [])) && hasContent(dayMeals)) {
      setWeek({ ...emptyWeek(), mon: cloneMeals(dayMeals) });
      setActiveDay("mon");
    }
    setLayout(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      const targetsClean = hasMacros(targets) ? { targets: cleanMacros(targets)! } : {};
      const notesClean = generalNotes.trim() ? { generalNotes: generalNotes.trim() } : {};
      let body: MealPlanBody;
      if (layout === "day") {
        const day: DayPlan = { meals: dayMeals.map(cleanMeal).filter(nonEmptyMeal) };
        body = { layout: "day", day, ...targetsClean, ...notesClean };
      } else {
        const days: Partial<Record<Weekday, DayPlan>> = {};
        for (const d of weekdays) {
          const cleaned = (week[d] ?? []).map(cleanMeal).filter(nonEmptyMeal);
          if (cleaned.length) days[d] = { meals: cleaned };
        }
        body = { layout: "week", days, ...targetsClean, ...notesClean };
      }
      await api(`patients/${patientId}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Plan alimentario",
          startDate: startDate || null,
          body,
        }),
      });
      onSaved();
    } catch (err) {
      onError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {initial && (
        <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-500">
          Guardar crea la versión v{initial.version + 1}; la actual queda en el historial.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-stone-500">Título</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-stone-500">Inicio (opcional)</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
        </label>
      </div>

      <fieldset className="rounded-xl border border-stone-200 p-3">
        <legend className="px-1 text-xs text-stone-500">Objetivo diario (opcional)</legend>
        <MacrosInputs value={targets} onChange={setTargets} />
      </fieldset>

      <div>
        <span className="mb-2 block text-xs text-stone-500">¿Cómo organizás el plan?</span>
        <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
          {(["day", "week"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => chooseLayout(l)}
              className={`rounded-md px-3 py-1.5 transition ${
                layout === l ? "bg-brand text-brand-fg" : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {l === "day" ? "Día tipo" : "Semana"}
            </button>
          ))}
        </div>
      </div>

      {layout === "day" ? (
        <div className="space-y-3">
          <MealsEditor meals={dayMeals} onChange={setDayMeals} />
          <DayTotals meals={dayMeals} targets={cleanMacros(targets)} />
        </div>
      ) : (
        <div className="space-y-3">
          <WeekdayTabs active={activeDay} week={week} onSelect={setActiveDay} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-stone-500">
              Editando <strong className="text-stone-700">{WEEKDAY_LABEL[activeDay]}</strong>
            </p>
            <button
              type="button"
              onClick={copyDayToAll}
              className="text-xs text-stone-500 transition hover:text-brand"
            >
              Copiar este día a toda la semana
            </button>
          </div>
          <MealsEditor
            meals={week[activeDay] ?? []}
            onChange={(m) => setWeek({ ...week, [activeDay]: m })}
          />
          <DayTotals meals={week[activeDay] ?? []} targets={cleanMacros(targets)} />
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-xs text-stone-500">Notas generales (opcional)</span>
        <textarea value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} rows={3} className={inputCls} />
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Guardar plan"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2.5 text-sm text-stone-500 transition hover:bg-stone-100">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Item con carga rápida (cantidad + alimento) y detalle expandible (alternativas
 * + macros). El detalle arranca abierto si el item ya trae esos datos. */
function ItemEditor({
  item,
  onChange,
  onRemove,
}: {
  item: MealItem;
  onChange: (patch: Partial<MealItem>) => void;
  onRemove: () => void;
}) {
  const hasDetail = Boolean(item.alternatives?.length || (item.macros && !item.food));
  const [open, setOpen] = useState(hasDetail);
  const food = item.food;
  return (
    <div className="rounded-lg bg-stone-50/60 p-2">
      <div className="flex gap-2">
        {food ? (
          <LinkedQuantity food={food} onChange={(next) => onChange(withFood(next))} />
        ) : (
          <>
            <input
              value={item.qty != null ? String(item.qty) : ""}
              onChange={(e) => onChange({ qty: e.target.value === "" ? undefined : Number(e.target.value) })}
              placeholder="Cant."
              inputMode="decimal"
              className={`${narrowCls} w-16`}
            />
            <input
              value={item.unit ?? ""}
              onChange={(e) => onChange({ unit: e.target.value || undefined })}
              placeholder="Unid."
              className={`${narrowCls} w-16`}
            />
          </>
        )}
        <FoodPicker
          value={item.text}
          onText={(text) => onChange({ text })}
          onPick={(f) => onChange({ text: f.name, ...withFood(linkFood(f)) })}
          className={inputCls}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`shrink-0 rounded-lg px-2 text-xs transition ${open ? "text-brand" : "text-stone-400 hover:text-stone-600"}`}
          aria-label="Detalle del item"
          aria-expanded={open}
        >
          detalle
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg px-2 text-sm text-stone-400 transition hover:text-red-600"
          aria-label="Quitar item"
        >
          ✕
        </button>
      </div>
      {food && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 pl-1 text-xs text-stone-400">
          <span>
            {round(food.grams)} g · {macroLine(item.macros ?? {})}
          </span>
          <button
            type="button"
            onClick={() => onChange({ food: undefined })}
            className="transition hover:text-red-600"
          >
            desvincular
          </button>
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-2 pl-1">
          <input
            value={item.note ?? ""}
            onChange={(e) => onChange({ note: e.target.value || undefined })}
            placeholder="Nota (ej. cocido al vapor)"
            className={inputCls}
          />
          <div>
            <span className="mb-1 block text-xs text-stone-400">Alternativas / intercambios</span>
            {(item.alternatives ?? []).map((alt, ai) => (
              <div key={ai} className="mb-1 flex gap-2">
                <input
                  value={alt.qty != null ? String(alt.qty) : ""}
                  onChange={(e) => {
                    const next = [...(item.alternatives ?? [])];
                    next[ai] = { ...alt, qty: e.target.value === "" ? undefined : Number(e.target.value) };
                    onChange({ alternatives: next });
                  }}
                  placeholder="Cant."
                  inputMode="decimal"
                  className={`${narrowCls} w-16`}
                />
                <input
                  value={alt.unit ?? ""}
                  onChange={(e) => {
                    const next = [...(item.alternatives ?? [])];
                    next[ai] = { ...alt, unit: e.target.value || undefined };
                    onChange({ alternatives: next });
                  }}
                  placeholder="Unid."
                  className={`${narrowCls} w-16`}
                />
                <input
                  value={alt.text}
                  onChange={(e) => {
                    const next = [...(item.alternatives ?? [])];
                    next[ai] = { ...alt, text: e.target.value };
                    onChange({ alternatives: next });
                  }}
                  placeholder="Alimento alternativo"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => onChange({ alternatives: (item.alternatives ?? []).filter((_, k) => k !== ai) })}
                  className="shrink-0 rounded-lg px-2 text-sm text-stone-400 transition hover:text-red-600"
                  aria-label="Quitar alternativa"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange({ alternatives: [...(item.alternatives ?? []), { text: "" }] })}
              className="text-xs text-stone-500 transition hover:text-brand"
            >
              + Agregar alternativa
            </button>
          </div>
          {!food && (
            <div>
              <span className="mb-1 block text-xs text-stone-400">Macros del item</span>
              <MacrosInputs
                value={item.macros ?? {}}
                onChange={(m) => onChange({ macros: hasMacros(m) ? m : undefined })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── vínculo con la base de alimentos (ADR 0018) ────────────────────────────

/** Unidad legible de una medida casera: "1 taza" → "taza", "1/2 taza" queda igual. */
const portionUnit = (label: string) => label.replace(/^1\s+/, "");

/** Vínculo inicial al elegir un alimento: 1 medida casera si tiene, si no 100 g. */
function linkFood(f: FoodDto): FoodRef {
  const portion = f.portions[0];
  return {
    source: f.source,
    id: f.id,
    grams: portion ? portion.grams : 100,
    ...(portion ? { portion, count: 1 } : {}),
    ...(f.portions.length ? { portions: f.portions.slice(0, 10) } : {}),
    per100g: {
      kcal: f.per100g.energyKcal,
      protein_g: f.per100g.proteinG,
      carbs_g: f.per100g.carbsG,
      fat_g: f.per100g.fatG,
    },
    attribution: f.attribution,
  };
}

/** Patch del item para un vínculo: cantidad visible + macros calculados (copia). */
function withFood(food: FoodRef): Partial<MealItem> {
  return {
    food,
    qty: food.portion ? food.count : Math.round(food.grams),
    unit: food.portion ? portionUnit(food.portion.label) : "g",
    macros: macrosForGrams(food.per100g, food.grams),
  };
}

/**
 * Cantidad de un item vinculado: número + unidad (gramos o una medida casera del
 * alimento, copiadas al vincular). Cambiar de unidad conserva el peso: pasar de
 * "1 taza" a gramos muestra 160; pasar de gramos a una medida arranca en 1.
 */
function LinkedQuantity({ food, onChange }: { food: FoodRef; onChange: (f: FoodRef) => void }) {
  const qty = food.portion ? food.count ?? 1 : Math.round(food.grams);
  // Medidas disponibles: las copiadas al vincular (+ la elegida, por si es de un plan
  // guardado antes de que se copiaran todas).
  const options = [...(food.portions ?? [])];
  if (food.portion && !options.some((o) => o.label === food.portion!.label)) options.unshift(food.portion);
  const setQty = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    if (!raw || Number.isNaN(n) || n <= 0) return;
    onChange(
      food.portion
        ? { ...food, count: n, grams: Math.min(n * food.portion.grams, 5000) }
        : { ...food, grams: Math.min(n, 5000) },
    );
  };
  return (
    <>
      <input
        defaultValue={String(qty)}
        key={`${food.portion?.label ?? "g"}`}
        onChange={(e) => setQty(e.target.value)}
        inputMode="decimal"
        aria-label="Cantidad"
        className={`${narrowCls} w-16`}
      />
      <select
        value={food.portion ? food.portion.label : "g"}
        onChange={(e) => {
          if (e.target.value === "g") {
            onChange({ ...food, portion: undefined, count: undefined });
            return;
          }
          const p = options.find((o) => o.label === e.target.value);
          if (p) onChange({ ...food, portion: p, count: 1, grams: p.grams });
        }}
        aria-label="Unidad"
        className={`${narrowCls} w-32`}
      >
        {options.map((o) => (
          <option key={o.label} value={o.label}>
            {portionUnit(o.label)}
          </option>
        ))}
        <option value="g">gramos</option>
      </select>
    </>
  );
}

/** Cuatro inputs P/C/G/kcal. Vacío = undefined (no se guarda). */
function MacrosInputs({
  value,
  onChange,
}: {
  value: Macros;
  onChange: (m: Macros) => void;
}) {
  const field = (key: keyof Macros, label: string) => (
    <label className="flex items-center gap-1">
      <span className="text-xs text-stone-400">{label}</span>
      <input
        value={value[key] != null ? String(value[key]) : ""}
        onChange={(e) =>
          onChange({ ...value, [key]: e.target.value === "" ? undefined : Number(e.target.value) })
        }
        inputMode="decimal"
        className={`${narrowCls} w-16`}
      />
    </label>
  );
  return (
    <div className="flex flex-wrap gap-3">
      {field("protein_g", "P (g)")}
      {field("carbs_g", "C (g)")}
      {field("fat_g", "G (g)")}
      {field("kcal", "kcal")}
    </div>
  );
}

// ── limpieza previa al submit ───────────────────────────────────────────────

const hasMacros = (m: Macros): boolean =>
  m.protein_g != null || m.carbs_g != null || m.fat_g != null || m.kcal != null;

function cleanMacros(m: Macros): Macros | undefined {
  const out: Macros = {};
  if (m.protein_g != null && !Number.isNaN(m.protein_g)) out.protein_g = m.protein_g;
  if (m.carbs_g != null && !Number.isNaN(m.carbs_g)) out.carbs_g = m.carbs_g;
  if (m.fat_g != null && !Number.isNaN(m.fat_g)) out.fat_g = m.fat_g;
  if (m.kcal != null && !Number.isNaN(m.kcal)) out.kcal = m.kcal;
  return hasMacros(out) ? out : undefined;
}

function cleanMeal(meal: PlanMeal): PlanMeal {
  return {
    name: meal.name.trim(),
    time: meal.time?.trim() || undefined,
    items: meal.items
      .map((it): MealItem => {
        const alternatives = (it.alternatives ?? [])
          .map((a) => ({
            text: a.text.trim(),
            qty: a.qty != null && !Number.isNaN(a.qty) ? a.qty : undefined,
            unit: a.unit?.trim() || undefined,
          }))
          .filter((a) => a.text.length > 0);
        return {
          text: it.text.trim(),
          qty: it.qty != null && !Number.isNaN(it.qty) ? it.qty : undefined,
          unit: it.unit?.trim() || undefined,
          note: it.note?.trim() || undefined,
          alternatives: alternatives.length ? alternatives : undefined,
          macros: it.macros ? cleanMacros(it.macros) : undefined,
          food: it.food,
        };
      })
      .filter((it) => it.text.length > 0),
  };
}
const nonEmptyMeal = (m: PlanMeal) => m.name.length > 0 && m.items.length > 0;
