"use client";

import { LayoutTemplate, ShoppingCart, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  dayMacros,
  dayTypeTargets,
  foodRefFor,
  macroCoverage,
  macrosForGrams,
  normalizeMealPlanBody,
  sumMacros,
  targetDeviation,
  weekdays,
  type DayPlan,
  type EnergyRequirementDto,
  type FoodDto,
  type FoodRef,
  type FoodSwapDto,
  type Macros,
  type MealItem,
  type MealPlanBody,
  type MealPlanDto,
  type PlanMeal,
  type PlanDraftDto,
  type PlanDraftedFrom,
  type PlanTemplateDto,
  type Weekday,
  dayKind,
} from "@nutreitor/shared";

import { api, errorMessage } from "@/lib/api";
import { FoodPicker } from "./food-picker";
import { ShoppingListView } from "./shopping-list";
import { WeekStrip, todayWeekday } from "./week-strip";
import { Alert, Button, Input, Label, Modal, useFeedback } from "@/components/ui";

const inputCls =
  "w-full rounded-lg border border-stone-200 bg-surface px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20";
const narrowCls =
  "rounded-lg border border-stone-200 bg-surface px-2 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20";
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
  canUseAgent = false,
}: {
  patientId: string;
  canWrite: boolean;
  /** NUTRI instalado y permitido: habilita "Borrador con NUTRI" en el editor. */
  canUseAgent?: boolean;
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
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = plans.find((p) => p.status === "active") ?? null;
  const history = plans.filter((p) => p.status !== "active");
  const { confirm, toast } = useFeedback();
  const [shopping, setShopping] = useState(false);

  async function archive() {
    const ok = await confirm({
      title: "¿Archivar el plan activo?",
      body: "El paciente se queda sin plan vigente. El plan queda en el historial.",
      confirmLabel: "Archivar",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    try {
      await api(`patients/${patientId}/plans/archive`, { method: "POST" });
      toast("Plan archivado");
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">
          Plan alimentario
          {loading && <span className="ml-2 text-stone-500">cargando…</span>}
        </h2>
        {!editing && (
          <div className="flex flex-wrap gap-2">
            {active && (
              <button
                onClick={() => setShopping(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-stone-600 transition hover:bg-stone-100"
              >
                <ShoppingCart className="h-4 w-4" aria-hidden />
                Lista de compras
              </button>
            )}
            {canWrite && (
              <>
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
              </>
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
            toast(active ? `Plan guardado como v${active.version + 1}` : "Plan creado");
            void load();
          }}
          onError={setError}
          patientId={patientId}
          canUseAgent={canUseAgent}
        />
      ) : active ? (
        <PlanView plan={active} />
      ) : (
        <p className="text-sm text-stone-500">
          Este paciente todavía no tiene un plan activo.
        </p>
      )}

      <Modal open={shopping} onClose={() => setShopping(false)} title="Lista de compras (1 semana)" className="max-w-2xl">
        {active && <ShoppingListView body={active.body} />}
      </Modal>

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

/**
 * Periodización visible en el plan (KAN-73): la tira de la semana con hoy marcado.
 * En el portal, además, una línea que dice qué día es hoy ("Hoy: partido").
 */
function PlanWeekStrip({
  body,
  forPatient,
  compact,
}: {
  body: Extract<MealPlanBody, { layout: "week" }>;
  forPatient: boolean;
  compact?: boolean;
}) {
  const today = todayWeekday();
  const t = body.dayTargets?.[today];
  const label = body.dayLabels?.[today];
  const days = weekdays.flatMap((wd) => {
    const m = body.dayTargets?.[wd];
    if (!m) return [];
    const l = body.dayLabels?.[wd];
    return [{ weekday: wd, label: l, kind: l ? dayKind(l) : undefined, kcal: m.kcal ?? null, choG: m.carbs_g ?? null }];
  });
  return (
    <div className="mt-4 space-y-3">
      {forPatient && t && (
        <p className="rounded-xl border border-accent2/40 bg-accent2/10 px-4 py-3 text-sm text-stone-700">
          <span className="font-display text-base font-bold uppercase tracking-wide text-stone-900">
            Hoy{label ? `: ${label.toLowerCase()}` : ""}
          </span>
          {t.kcal != null && <> · {t.kcal.toLocaleString("es-AR")} kcal</>}
          {t.carbs_g != null && <> · {Math.round(t.carbs_g)} g de carbohidratos</>}
        </p>
      )}
      {!compact && <WeekStrip days={days} today={today} />}
    </div>
  );
}

export function PlanView({
  plan,
  compact,
  forPatient = false,
}: {
  plan: MealPlanDto;
  compact?: boolean;
  /** Vista del paciente: sin desvíos contra el objetivo y sin totales parciales. */
  forPatient?: boolean;
}) {
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
        <span className="text-xs text-stone-500">
          {start ? `desde ${start} · ` : ""}
          {plan.authorName} · {new Date(plan.createdAt).toLocaleDateString("es-AR")}
        </span>
      </div>

      {body.targets && (
        <p className="mt-2 text-xs text-stone-500">
          <span className="uppercase tracking-widest text-stone-500">Objetivo</span>{" "}
          {macroLine(body.targets)}
        </p>
      )}

      {body.layout === "week" && body.dayTargets && Object.keys(body.dayTargets).length > 0 && (
        <PlanWeekStrip body={body} forPatient={forPatient} compact={compact} />
      )}

      <div className="mt-3 space-y-4">
        {empty && <p className="text-sm text-stone-500">Sin comidas cargadas.</p>}
        {groups.map((g) => (
          <div key={g.key} className={g.label ? "space-y-2" : "space-y-3"}>
            {g.label && (
              <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
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
                      {meal.time && <span className="text-xs text-stone-500">{meal.time}</span>}
                    </div>
                    {totals && <span className="text-xs text-stone-500">{macroLine(totals)}</span>}
                  </div>
                  <ul className="space-y-1">
                    {meal.items.map((it, j) => (
                      <li key={j} className="text-sm text-stone-700">
                        · {qtyText(it) && <span className="text-stone-500">{qtyText(it)} </span>}
                        {it.text}
                        {it.food && it.food.portion && (
                          <span className="text-stone-500"> ({round(it.food.grams)} g)</span>
                        )}
                        {it.note && <span className="text-stone-500"> — {it.note}</span>}
                        {it.macros && (
                          <span className="ml-1 text-xs text-stone-500">({macroLine(it.macros)})</span>
                        )}
                        {it.alternatives && it.alternatives.length > 0 && (
                          <span className="block pl-4 text-xs text-stone-500">
                            o: {it.alternatives.map((a) => `${qtyText(a)} ${a.text}`.trim()).join(" · ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <DayTotals
              meals={g.meals}
              targets={(body.layout === "week" && body.dayTargets?.[g.key as Weekday]) || body.targets}
              forPatient={forPatient}
            />
          </div>
        ))}
        {plan.body.generalNotes && (
          <p className="whitespace-pre-line text-sm text-stone-600">
            <span className="text-xs uppercase tracking-widest text-stone-500">Notas</span>
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
 * Si hay items sin macros el total es PARCIAL: se dice así y sin desvíos (un "−87 %"
 * por datos faltantes alarma sin motivo). El paciente sólo ve el total completo,
 * nunca el desvío (es una herramienta del profesional).
 */
export function DayTotals({
  meals,
  targets,
  forPatient = false,
}: {
  meals: PlanMeal[];
  targets?: Macros;
  forPatient?: boolean;
}) {
  const total = dayMacros({ meals });
  if (!total) return null;
  const coverage = macroCoverage({ meals });
  if (forPatient && !coverage.complete) return null;
  const showTargets = !forPatient && coverage.complete;
  const keys: [keyof Macros, string, string][] = [
    ["kcal", "kcal", ""],
    ["protein_g", "P", " g"],
    ["carbs_g", "C", " g"],
    ["fat_g", "G", " g"],
  ];
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg bg-stone-50 px-3 py-2 text-xs">
      <span className="font-semibold uppercase tracking-widest text-stone-500">
        {coverage.complete ? "Total del día" : "Total parcial"}
      </span>
      {keys.map(([k, label, unit]) => {
        const v = total[k];
        if (v == null) return null;
        const dev = showTargets ? targetDeviation(v, targets?.[k]) : null;
        const off = dev != null && Math.abs(dev) > 10;
        return (
          <span key={k} className={off ? "font-medium text-amber-700" : "text-stone-600"}>
            {label} {round(v)}
            {unit}
            {showTargets && targets?.[k] != null && (
              <span className="text-stone-500">
                {" "}
                / {round(targets[k]!)}
                {unit}
                {dev != null && dev !== 0 && ` (${dev > 0 ? "+" : ""}${dev}%)`}
              </span>
            )}
          </span>
        );
      })}
      {!coverage.complete && (
        <span className="text-stone-500">
          ({coverage.withKcal} de {coverage.items} ítems con macros)
        </span>
      )}
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
    <p className="text-[11px] text-stone-500">
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
/**
 * Editor de comidas. `variant="intake"` (recordatorio de 24 h, ADR 0033) oculta lo que
 * sólo tiene sentido al prescribir: alternativas e intercambios.
 */
export function MealsEditor({
  meals,
  onChange,
  variant = "plan",
}: {
  meals: PlanMeal[];
  onChange: (m: PlanMeal[]) => void;
  variant?: "plan" | "intake";
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
              className="shrink-0 rounded-lg px-2 text-sm text-stone-500 transition hover:text-red-600"
              aria-label="Quitar comida"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2 pl-1">
            {meal.items.map((it, ii) => (
              <ItemEditor
                key={ii}
                variant={variant}
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
  canUseAgent,
  onCancel,
  onSaved,
  onError,
}: {
  initial: MealPlanDto | null;
  patientId: string;
  canUseAgent: boolean;
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
  const [dayTargets, setDayTargets] = useState<Partial<Record<Weekday, Macros>>>(
    initial?.body.layout === "week" ? (initial.body.dayTargets ?? {}) : {},
  );
  // Nombre del tipo de día ("Partido"), del requerimiento (KAN-73).
  const [dayLabels, setDayLabels] = useState<Partial<Record<Weekday, string>>>(
    initial?.body.layout === "week" ? (initial.body.dayLabels ?? {}) : {},
  );
  const { confirm, toast } = useFeedback();
  const [templates, setTemplates] = useState<PlanTemplateDto[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  // Métricas de eficiencia (Fase 4.4): cuánto lleva armar la versión y desde qué partió.
  const openedAt = useRef(Date.now());
  const [draftedFrom, setDraftedFrom] = useState<PlanDraftedFrom>(initial ? "previous" : "scratch");
  const [draft, setDraft] = useState<Pick<PlanDraftDto, "notes" | "unresolved"> | null>(null);
  useEffect(() => {
    api<PlanTemplateDto[]>("plan-templates")
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);
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

  /** Cuerpo del plan a partir del estado del editor (lo usan guardar y plantilla). */
  function buildBody(): MealPlanBody {
    const targetsClean = hasMacros(targets) ? { targets: cleanMacros(targets)! } : {};
    const notesClean = generalNotes.trim() ? { generalNotes: generalNotes.trim() } : {};
    if (layout === "day") {
      const day: DayPlan = { meals: dayMeals.map(cleanMeal).filter(nonEmptyMeal) };
      return { layout: "day", day, ...targetsClean, ...notesClean };
    }
    const days: Partial<Record<Weekday, DayPlan>> = {};
    for (const d of weekdays) {
      const cleaned = (week[d] ?? []).map(cleanMeal).filter(nonEmptyMeal);
      if (cleaned.length) days[d] = { meals: cleaned };
    }
    const dayTargetsClean = Object.fromEntries(
      weekdays.flatMap((d) => (dayTargets[d] && hasMacros(dayTargets[d]!) ? [[d, cleanMacros(dayTargets[d]!)!]] : [])),
    ) as Partial<Record<Weekday, Macros>>;
    // El nombre sólo viaja con un objetivo para ese día.
    const dayLabelsClean = Object.fromEntries(
      weekdays.flatMap((d) => (dayTargetsClean[d] && dayLabels[d]?.trim() ? [[d, dayLabels[d]!.trim()]] : [])),
    ) as Partial<Record<Weekday, string>>;
    return {
      layout: "week",
      days,
      ...targetsClean,
      ...(Object.keys(dayTargetsClean).length ? { dayTargets: dayTargetsClean } : {}),
      ...(Object.keys(dayLabelsClean).length ? { dayLabels: dayLabelsClean } : {}),
      ...notesClean,
    };
  }

  const editorHasContent = () => hasContent(dayMeals) || weekdays.some((d) => hasContent(week[d] ?? []));

  /** Carga un cuerpo (plantilla o borrador) en el editor; las notas se conservan si no trae. */
  function loadBody(body: MealPlanBody) {
    const next = initialEditorState({ body } as MealPlanDto);
    setLayout(next.layout);
    setDayMeals(next.dayMeals);
    setWeek(next.week);
    setActiveDay("mon");
    if (body.targets) setTargets(body.targets);
    setDayTargets(body.layout === "week" ? (body.dayTargets ?? {}) : {});
    setDayLabels(body.layout === "week" ? (body.dayLabels ?? {}) : {});
    if (body.generalNotes) setGeneralNotes(body.generalNotes);
  }

  /** Borrador de NUTRI (ADR 0020): se abre en el editor sin guardar, para revisar. */
  async function requestDraft(instructions: string) {
    const res = await api<PlanDraftDto>("agents/plan-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId,
        ...(hasMacros(targets) ? { targets: cleanMacros(targets) } : {}),
        ...(instructions ? { instructions } : {}),
      }),
    });
    loadBody(res.body);
    setDraft({ notes: res.notes, unresolved: res.unresolved });
    setDraftedFrom("nutri");
    setDraftOpen(false);
    toast("Borrador de NUTRI cargado: revisalo antes de guardar");
  }

  /** Carga una plantilla en el editor (reemplaza lo cargado, previa confirmación). */
  async function applyTemplate(t: PlanTemplateDto) {
    if (
      editorHasContent() &&
      !(await confirm({
        title: `¿Cargar la plantilla "${t.name}"?`,
        body: "Reemplaza las comidas, el objetivo y las notas que tenés cargados en el editor.",
        confirmLabel: "Cargar plantilla",
      }))
    ) {
      return;
    }
    loadBody(t.body);
    setTargets(t.body.targets ?? {});
    setGeneralNotes(t.body.generalNotes ?? "");
    setDraft(null);
    setDraftedFrom("template");
    toast(`Plantilla "${t.name}" cargada: ajustala al paciente`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      const body = buildBody();
      await api(`patients/${patientId}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Plan alimentario",
          startDate: startDate || null,
          body,
          editSeconds: Math.round((Date.now() - openedAt.current) / 1000),
          draftedFrom,
        }),
      });
      onSaved();
    } catch (err) {
      onError(errorMessage(err));
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
      {templates.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-stone-300 px-3 py-2">
          <LayoutTemplate className="h-4 w-4 text-stone-500" aria-hidden />
          <span className="text-sm text-stone-600">Empezar desde una plantilla</span>
          <select
            value=""
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (t) void applyTemplate(t);
            }}
            className={`${narrowCls} min-w-[12rem] flex-1`}
          >
            <option value="">Elegir…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {canUseAgent && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-stone-300 px-3 py-2">
          <Sparkles className="h-4 w-4 text-brand" aria-hidden />
          <span className="flex-1 text-sm text-stone-600">
            NUTRI arma un día tipo con el objetivo y las alergias de la ficha
          </span>
          <Button
            variant="secondary"
            onClick={async () => {
              if (
                editorHasContent() &&
                !(await confirm({
                  title: "¿Pedir un borrador a NUTRI?",
                  body: "El borrador reemplaza las comidas que tenés cargadas en el editor.",
                  confirmLabel: "Continuar",
                }))
              ) {
                return;
              }
              setDraftOpen(true);
            }}
          >
            Borrador con NUTRI
          </Button>
        </div>
      )}
      {draft && (
        <Alert tone="info">
          <strong className="font-medium">Borrador de NUTRI — revisalo antes de guardar.</strong>{" "}
          {draft.notes}
          {draft.unresolved.length > 0 && (
            <> Se descartaron alimentos que no están en la base: {draft.unresolved.join(", ")}.</>
          )}
        </Alert>
      )}
      <PlanDraftDialog open={draftOpen} onClose={() => setDraftOpen(false)} onRequest={requestDraft} />
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
        <EnergyTargetsPicker
          patientId={patientId}
          weekLayout={layout === "week"}
          onDay={(m) => setTargets(m)}
          onWeek={(byDay, labels) => {
            setDayTargets(byDay);
            setDayLabels(labels);
            toast("Objetivos por día cargados desde la semana tipo");
          }}
        />
      </fieldset>

      <div>
        <span className="mb-2 block text-xs text-stone-500">¿Cómo organizás el plan?</span>
        <div className="inline-flex rounded-lg border border-stone-200 bg-surface p-0.5 text-sm">
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
          {Object.keys(dayTargets).length > 0 && (
            <WeekStrip
              days={weekdays.flatMap((wd) => {
                const t = dayTargets[wd];
                if (!t) return [];
                const label = dayLabels[wd];
                return [{ weekday: wd, label, kind: label ? dayKind(label) : undefined, kcal: t.kcal ?? null, choG: t.carbs_g ?? null }];
              })}
              selected={activeDay}
              onSelect={setActiveDay}
            />
          )}
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
          <DayTargetEditor
            day={activeDay}
            value={dayTargets[activeDay]}
            onChange={(m) => setDayTargets((t) => ({ ...t, [activeDay]: m }))}
            onClear={() => {
              setDayTargets((t) => {
                const next = { ...t };
                delete next[activeDay];
                return next;
              });
              setDayLabels((l) => {
                const next = { ...l };
                delete next[activeDay];
                return next;
              });
            }}
          />
          <DayTotals meals={week[activeDay] ?? []} targets={cleanMacros(dayTargets[activeDay] ?? targets)} />
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
        <button
          type="button"
          onClick={() => setSavingTemplate(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm text-stone-600 transition hover:bg-stone-100"
        >
          <LayoutTemplate className="h-4 w-4" aria-hidden />
          Guardar como plantilla
        </button>
      </div>
      <SaveTemplateDialog
        open={savingTemplate}
        defaultName={title}
        onClose={() => setSavingTemplate(false)}
        onSave={async (name, description) => {
          await api<PlanTemplateDto>("plan-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description: description || null, body: buildBody() }),
          });
          setSavingTemplate(false);
          toast("Plantilla guardada: ya la podés usar con otros pacientes");
          api<PlanTemplateDto[]>("plan-templates").then(setTemplates).catch(() => {});
        }}
      />
    </form>
  );
}

/** Nombre y descripción para guardar el plan del editor como plantilla. */
function PlanDraftDialog({
  open,
  onClose,
  onRequest,
}: {
  open: boolean;
  onClose: () => void;
  onRequest: (instructions: string) => Promise<void>;
}) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Borrador con NUTRI">
      <p className="mb-4 text-sm text-stone-600">
        NUTRI propone un día tipo con alimentos de la base, usando el objetivo cargado en el
        editor (o el del plan activo) y las alergias y preferencias de la ficha. Los macros
        se calculan desde la base. Es un borrador: no se guarda hasta que lo revises.
      </p>
      {error && <Alert className="mb-3">{error}</Alert>}
      <Label label="Indicaciones (opcional)" hint="Ej.: cena liviana, sin harinas a la noche, 5 comidas">
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          maxLength={1000}
          className={inputCls}
        />
      </Label>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onRequest(instructions.trim());
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Armando…" : "Armar borrador"}
        </Button>
      </div>
    </Modal>
  );
}

function SaveTemplateDialog({
  open,
  defaultName,
  onClose,
  onSave,
}: {
  open: boolean;
  defaultName: string;
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setDescription("");
      setError(null);
    }
  }, [open, defaultName]);
  return (
    <Modal open={open} onClose={onClose} title="Guardar como plantilla">
      <p className="mb-4 text-sm text-stone-600">
        Guarda las comidas, el objetivo y las notas (no los datos del paciente) para usarlos
        como punto de partida con otros pacientes.
      </p>
      {error && <Alert className="mb-3">{error}</Alert>}
      <div className="space-y-3">
        <Label label="Nombre de la plantilla">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Label>
        <Label label="Descripción (opcional)" hint="Ej.: hipocalórico 1800 kcal, sin lácteos">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSave(name.trim(), description.trim());
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Guardando…" : "Guardar plantilla"}
        </Button>
      </div>
    </Modal>
  );
}

/** Item con carga rápida (cantidad + alimento) y detalle expandible (alternativas
 * + macros). El detalle arranca abierto si el item ya trae esos datos. */
function ItemEditor({
  item,
  onChange,
  onRemove,
  variant = "plan",
}: {
  item: MealItem;
  onChange: (patch: Partial<MealItem>) => void;
  onRemove: () => void;
  variant?: "plan" | "intake";
}) {
  const prescribing = variant === "plan";
  const hasDetail = Boolean(item.alternatives?.length || (item.macros && !item.food));
  const [open, setOpen] = useState(hasDetail);
  const [swapsOpen, setSwapsOpen] = useState(false);
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
          className={`shrink-0 rounded-lg px-2 text-xs transition ${open ? "text-brand" : "text-stone-500 hover:text-stone-600"}`}
          aria-label="Detalle del item"
          aria-expanded={open}
        >
          detalle
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg px-2 text-sm text-stone-500 transition hover:text-red-600"
          aria-label="Quitar item"
        >
          ✕
        </button>
      </div>
      {food && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 pl-1 text-xs text-stone-500">
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
          {prescribing && (
            <button
              type="button"
              onClick={() => setSwapsOpen((o) => !o)}
              className={`transition ${swapsOpen ? "text-brand" : "hover:text-brand"}`}
              aria-expanded={swapsOpen}
            >
              intercambios
            </button>
          )}
        </div>
      )}
      {food && swapsOpen && (
        <SwapSuggestions
          food={food}
          onReplace={(s) => {
            onChange({ text: s.food.name, ...withFood(swapLink(s)) });
            setSwapsOpen(false);
          }}
          onAddAlternative={(s) => {
            onChange({ alternatives: [...(item.alternatives ?? []), { text: s.food.name, qty: s.grams, unit: "g" }] });
            setOpen(true);
          }}
        />
      )}
      {open && (
        <div className="mt-2 space-y-2 pl-1">
          <input
            value={item.note ?? ""}
            onChange={(e) => onChange({ note: e.target.value || undefined })}
            placeholder="Nota (ej. cocido al vapor)"
            className={inputCls}
          />
          {prescribing && (
          <div>
            <span className="mb-1 block text-xs text-stone-500">Alternativas / intercambios</span>
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
                  className="shrink-0 rounded-lg px-2 text-sm text-stone-500 transition hover:text-red-600"
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
          )}
          {!food && (
            <div>
              <span className="mb-1 block text-xs text-stone-500">Macros del item</span>
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

/** Vínculo de un intercambio: el alimento sugerido en los gramos que igualan las kcal. */
function swapLink(s: FoodSwapDto): FoodRef {
  return foodRefFor(s.food, s.grams);
}

const signed = (n: number) => {
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}`;
};

/**
 * Intercambios por equivalencia calculada (Fase 4.2): alimentos del mismo grupo en
 * la cantidad que da las mismas kcal, ordenados por parecido de macros. Se puede
 * reemplazar el item o sumar la sugerencia como alternativa para el paciente.
 */
function SwapSuggestions({
  food,
  onReplace,
  onAddAlternative,
}: {
  food: FoodRef;
  onReplace: (s: FoodSwapDto) => void;
  onAddAlternative: (s: FoodSwapDto) => void;
}) {
  const [swaps, setSwaps] = useState<FoodSwapDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const grams = Math.round(food.grams);
  useEffect(() => {
    let alive = true;
    setSwaps(null);
    setError(null);
    api<FoodSwapDto[]>(`foods/${food.source}/${food.id}/swaps?grams=${grams}`)
      .then((r) => alive && setSwaps(r))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [food.source, food.id, grams]);

  return (
    <div className="mt-2 rounded-lg border border-stone-200 bg-surface p-2 text-xs">
      <p className="mb-1.5 text-stone-500">
        Mismo grupo{food.group ? ` (${food.group})` : ""}, mismas kcal que {grams} g. Diferencia de macros en g.
      </p>
      {error && <p className="text-red-600">{error}</p>}
      {!error && !swaps && <p className="text-stone-400">Buscando intercambios…</p>}
      {swaps && swaps.length === 0 && <p className="text-stone-500">No hay intercambios equivalentes en este grupo.</p>}
      {swaps && swaps.length > 0 && (
        <ul className="divide-y divide-stone-100">
          {swaps.map((s) => (
            <li key={`${s.food.source}:${s.food.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-stone-700">{s.grams} g</span> {s.food.name}
                <span className="ml-2 text-stone-400">
                  P {signed(s.delta.proteinG)} · C {signed(s.delta.carbsG)} · G {signed(s.delta.fatG)}
                </span>
              </span>
              <button type="button" onClick={() => onReplace(s)} className="text-brand hover:underline">
                Reemplazar
              </button>
              <button type="button" onClick={() => onAddAlternative(s)} className="text-stone-500 hover:text-brand">
                Sumar como alternativa
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Unidad legible de una medida casera: "1 taza" → "taza", "1/2 taza" queda igual. */
const portionUnit = (label: string) => label.replace(/^1\s+/, "");

/** Vínculo inicial al elegir un alimento: 1 medida casera si tiene, si no 100 g. */
const linkFood = (f: FoodDto): FoodRef => foodRefFor(f);

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
  // El texto del campo es local (para no pelear con lo que se tipea: "1," o vacío) y
  // se re-sincroniza cuando la cantidad cambia desde afuera (intercambio, borrador de
  // NUTRI, plantilla, cambio de unidad) mientras el campo no tiene el foco.
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(String(qty));
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(String(qty));
  }, [qty]);
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
        ref={inputRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setQty(e.target.value);
        }}
        onBlur={() => setText(String(qty))}
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
      <span className="text-xs text-stone-500">{label}</span>
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

/** Objetivo propio del día en un plan semanal (si no tiene, usa el objetivo diario). */
function DayTargetEditor({
  day,
  value,
  onChange,
  onClear,
}: {
  day: Weekday;
  value: Macros | undefined;
  onChange: (m: Macros) => void;
  onClear: () => void;
}) {
  if (!value) {
    return (
      <button type="button" onClick={() => onChange({})} className="text-xs text-stone-500 transition hover:text-brand">
        + Objetivo propio para el {WEEKDAY_LABEL[day].toLowerCase()}
      </button>
    );
  }
  return (
    <fieldset className="rounded-xl border border-brand/30 bg-brand/5 p-3">
      <legend className="px-1 text-xs text-stone-600">Objetivo del {WEEKDAY_LABEL[day].toLowerCase()}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MacrosInputs value={value} onChange={onChange} />
        <button type="button" onClick={onClear} className="text-xs text-stone-500 hover:text-red-600">
          Usar el objetivo diario
        </button>
      </div>
    </fieldset>
  );
}

/**
 * Trae los objetivos del requerimiento energético vigente (ADR 0032): un tipo de día
 * al objetivo diario, o la semana tipo completa a los objetivos por día.
 */
function EnergyTargetsPicker({
  patientId,
  weekLayout,
  onDay,
  onWeek,
}: {
  patientId: string;
  weekLayout: boolean;
  onDay: (m: Macros) => void;
  onWeek: (byDay: Partial<Record<Weekday, Macros>>, labels: Partial<Record<Weekday, string>>) => void;
}) {
  const [req, setReq] = useState<EnergyRequirementDto | null | undefined>(undefined);
  useEffect(() => {
    api<EnergyRequirementDto[]>(`patients/${patientId}/energy`).then(
      (list) => setReq(list[0] ?? null),
      () => setReq(null),
    );
  }, [patientId]);
  if (!req || !req.results.days.ok) return null;
  const days = req.results.days.value;
  const byId = new Map(days.map((d) => [d.id, d]));
  const weekReady = weekdays.every((d) => req.week[d] && byId.has(req.week[d]!));
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3 text-xs text-stone-500">
      <span>Desde el requerimiento:</span>
      {days.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onDay(dayTypeTargets(d))}
          className="rounded-full border border-stone-200 px-2.5 py-1 text-stone-700 transition hover:border-brand/40 hover:text-brand"
          title={`${d.targetKcal} kcal · C ${d.choG} g · P ${d.proG} g · G ${d.fatG} g`}
        >
          {d.name} · {d.targetKcal} kcal
        </button>
      ))}
      {weekLayout && weekReady && (
        <button
          type="button"
          onClick={() =>
            onWeek(
              Object.fromEntries(weekdays.map((wd) => [wd, dayTypeTargets(byId.get(req.week[wd]!)!)])) as Partial<Record<Weekday, Macros>>,
              Object.fromEntries(weekdays.map((wd) => [wd, byId.get(req.week[wd]!)!.name])) as Partial<Record<Weekday, string>>,
            )
          }
          className="rounded-full bg-brand/10 px-2.5 py-1 font-medium text-brand transition hover:bg-brand/15"
        >
          Aplicar la semana tipo
        </button>
      )}
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

export function cleanMeal(meal: PlanMeal): PlanMeal {
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
export const nonEmptyMeal = (m: PlanMeal) => m.name.length > 0 && m.items.length > 0;
