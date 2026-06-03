"use client";

import { useCallback, useEffect, useState } from "react";
import type { MealPlanBody, MealPlanDto, PlanMeal } from "@nutreitor/shared";

import { api } from "@/lib/api";

const inputCls =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20";
const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("es-AR") : null;

/**
 * Sección "Plan alimentario": muestra el plan ACTIVO (comidas → items), permite
 * revisarlo (crea una versión nueva), archivarlo, y ver el historial de versiones.
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
        <span className="text-xs text-stone-400">
          {start ? `desde ${start} · ` : ""}
          {plan.authorName} · {new Date(plan.createdAt).toLocaleDateString("es-AR")}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {plan.body.meals.length === 0 && (
          <p className="text-sm text-stone-400">Sin comidas cargadas.</p>
        )}
        {plan.body.meals.map((meal, i) => (
          <div key={i} className="rounded-xl border border-stone-100 p-3">
            <div className="mb-1 flex items-baseline gap-2">
              <span className="font-medium text-stone-800">{meal.name}</span>
              {meal.time && <span className="text-xs text-stone-400">{meal.time}</span>}
            </div>
            <ul className="space-y-1">
              {meal.items.map((it, j) => (
                <li key={j} className="text-sm text-stone-700">
                  · {it.text}
                  {it.note && <span className="text-stone-400"> — {it.note}</span>}
                </li>
              ))}
            </ul>
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

function emptyMeal(): PlanMeal {
  return { name: "", items: [{ text: "" }] };
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
  const [title, setTitle] = useState(initial?.title ?? "Plan alimentario");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [meals, setMeals] = useState<PlanMeal[]>(
    initial && initial.body.meals.length > 0 ? initial.body.meals : [emptyMeal()],
  );
  const [generalNotes, setGeneralNotes] = useState(initial?.body.generalNotes ?? "");
  const [busy, setBusy] = useState(false);

  function updateMeal(i: number, patch: Partial<PlanMeal>) {
    setMeals((m) => m.map((meal, j) => (j === i ? { ...meal, ...patch } : meal)));
  }
  function updateItem(mi: number, ii: number, patch: Partial<{ text: string; note: string }>) {
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
      // Limpia comidas/items vacíos antes de enviar.
      const body: MealPlanBody = {
        meals: meals
          .map((meal) => ({
            name: meal.name.trim(),
            time: meal.time?.trim() || undefined,
            items: meal.items
              .map((it) => ({ text: it.text.trim(), note: it.note?.trim() || undefined }))
              .filter((it) => it.text.length > 0),
          }))
          .filter((meal) => meal.name.length > 0 && meal.items.length > 0),
        generalNotes: generalNotes.trim() || undefined,
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
                className="w-28 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <button
                type="button"
                onClick={() => setMeals((m) => m.filter((_, j) => j !== mi))}
                className="shrink-0 rounded-lg px-2 text-sm text-stone-400 transition hover:text-red-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 pl-1">
              {meal.items.map((it, ii) => (
                <div key={ii} className="flex gap-2">
                  <input
                    value={it.text}
                    onChange={(e) => updateItem(mi, ii, { text: e.target.value })}
                    placeholder="Alimento / preparación"
                    className={inputCls}
                  />
                  <input
                    value={it.note ?? ""}
                    onChange={(e) => updateItem(mi, ii, { note: e.target.value })}
                    placeholder="Nota (cantidad…)"
                    className="w-40 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateMeal(mi, { items: meal.items.filter((_, k) => k !== ii) })
                    }
                    className="shrink-0 rounded-lg px-2 text-sm text-stone-400 transition hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
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
