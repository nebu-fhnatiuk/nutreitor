"use client";

import { useCallback, useEffect, useState } from "react";
import {
  weekdays,
  type DayPlan,
  type Macros,
  type MealItem,
  type MealPlanBody,
  type MealPlanDto,
  type PlanMeal,
  type Weekday,
} from "@nutreitor/shared";

import { api } from "@/lib/api";

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

/** Suma de macros de una comida. Sólo incluye una clave si AL MENOS un item la
 * trae (evita mostrar "C 0" engañoso cuando el dato no se cargó). Null si ningún
 * item tiene macros. */
function mealMacros(meal: PlanMeal): Macros | null {
  const keys = ["protein_g", "carbs_g", "fat_g", "kcal"] as const;
  const acc: Macros = {};
  let any = false;
  for (const it of meal.items) {
    if (!it.macros) continue;
    any = true;
    for (const k of keys) {
      const v = it.macros[k];
      if (v != null) acc[k] = (acc[k] ?? 0) + v;
    }
  }
  return any ? acc : null;
}

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
  const groups = daysOf(plan.body);
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
          {plan.body.layout === "week" ? "semanal" : "día tipo"}
        </span>
        <span className="text-xs text-stone-400">
          {start ? `desde ${start} · ` : ""}
          {plan.authorName} · {new Date(plan.createdAt).toLocaleDateString("es-AR")}
        </span>
      </div>

      {plan.body.targets && (
        <p className="mt-2 text-xs text-stone-500">
          <span className="uppercase tracking-widest text-stone-400">Objetivo</span>{" "}
          {macroLine(plan.body.targets)}
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
          </div>
        ))}
        {plan.body.generalNotes && (
          <p className="whitespace-pre-line text-sm text-stone-600">
            <span className="text-xs uppercase tracking-widest text-stone-400">Notas</span>
            <br />
            {plan.body.generalNotes}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Editor (layout día-tipo) ────────────────────────────────────────────────

function emptyMeal(): PlanMeal {
  return { name: "", items: [{ text: "" }] };
}

/** Comidas iniciales del editor: día-tipo directo; si el plan era semanal, toma
 * el primer día con comidas (el editor de semana llega en A2). */
function initialMeals(plan: MealPlanDto | null): PlanMeal[] {
  if (!plan) return [emptyMeal()];
  const body = plan.body;
  const meals =
    body.layout === "week"
      ? (weekdays.map((d) => body.days[d]).find((day) => day && day.meals.length > 0)?.meals ?? [])
      : body.day.meals;
  return meals.length > 0 ? meals.map(cloneMeal) : [emptyMeal()];
}
const cloneMeal = (m: PlanMeal): PlanMeal => ({
  ...m,
  items: m.items.map((it) => ({ ...it, alternatives: it.alternatives?.map((a) => ({ ...a })) })),
});

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
  // El editor sólo escribe layout "day". Editar un plan semanal acá colapsaría la
  // semana a un día y perdería el resto: hasta el editor semanal (A2) se bloquea.
  const isWeek = initial?.body.layout === "week";
  const [title, setTitle] = useState(initial?.title ?? "Plan alimentario");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [meals, setMeals] = useState<PlanMeal[]>(() => initialMeals(initial));
  const [targets, setTargets] = useState<Macros>(initial?.body.targets ?? {});
  const [generalNotes, setGeneralNotes] = useState(initial?.body.generalNotes ?? "");
  const [busy, setBusy] = useState(false);

  function updateMeal(i: number, patch: Partial<PlanMeal>) {
    setMeals((m) => m.map((meal, j) => (j === i ? { ...meal, ...patch } : meal)));
  }
  function updateItem(mi: number, ii: number, patch: Partial<MealItem>) {
    setMeals((m) =>
      m.map((meal, j) =>
        j === mi
          ? { ...meal, items: meal.items.map((it, k) => (k === ii ? { ...it, ...patch } : it)) }
          : meal,
      ),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      const day: DayPlan = { meals: meals.map(cleanMeal).filter(nonEmptyMeal) };
      const body: MealPlanBody = {
        layout: "day",
        day,
        ...(hasMacros(targets) ? { targets: cleanMacros(targets)! } : {}),
        ...(generalNotes.trim() ? { generalNotes: generalNotes.trim() } : {}),
      };
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

  if (isWeek) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este plan es <strong>semanal</strong>. El editor semanal todavía no está
          disponible; editarlo acá perdería los días de la semana. Por ahora se puede
          ver y archivar, pero no revisar.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2.5 text-sm text-stone-500 transition hover:bg-stone-100"
        >
          Volver
        </button>
      </div>
    );
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
                onClick={() => setMeals((m) => m.filter((_, j) => j !== mi))}
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
                  onRemove={() =>
                    updateMeal(mi, { items: meal.items.filter((_, k) => k !== ii) })
                  }
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
          onClick={() => setMeals((m) => [...m, emptyMeal()])}
          className="rounded-lg border border-dashed border-stone-300 px-4 py-2 text-sm text-stone-500 transition hover:border-brand/50 hover:text-stone-700"
        >
          + Agregar comida
        </button>
      </div>

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
  const hasDetail = Boolean(item.alternatives?.length || item.macros);
  const [open, setOpen] = useState(hasDetail);
  return (
    <div className="rounded-lg bg-stone-50/60 p-2">
      <div className="flex gap-2">
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
        <input
          value={item.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Alimento / preparación"
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
          <div>
            <span className="mb-1 block text-xs text-stone-400">Macros del item</span>
            <MacrosInputs
              value={item.macros ?? {}}
              onChange={(m) => onChange({ macros: hasMacros(m) ? m : undefined })}
            />
          </div>
        </div>
      )}
    </div>
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
        };
      })
      .filter((it) => it.text.length > 0),
  };
}
const nonEmptyMeal = (m: PlanMeal) => m.name.length > 0 && m.items.length > 0;
