"use client";

import { ArrowRight, Utensils } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  dayMacros,
  isoDay,
  macroCoverage,
  mealsForDate,
  normalizeMealPlanBody,
  type MealPlanBody,
  type PlanMeal,
  type PortalMeDto,
} from "@nutreitor/shared";

import { Alert, Button, Card, EmptyState, Input, Loading, SectionHeading, buttonClass } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { LineChart } from "@/components/patients/line-chart";
import { DailyReminder, DayCheckin, MealCheck, useDayAdherence } from "./portal-adherence";
import { PortalAppointments } from "./portal-appointments";
import { PortalReportsCard } from "./portal-reports";
import { PortalAssistant } from "./portal-assistant";

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("es-AR");

/**
 * Portal del paciente (sólo su propia ficha), pensado primero para el celular. Arriba
 * lo que se usa todos los días: lo que le toca comer HOY y su próximo turno; después
 * la evolución y sus datos de salud. El plan completo (imprimible) vive en /app/plan.
 * NUNCA muestra las notas clínicas del profesional.
 */
export function PortalView() {
  const [me, setMe] = useState<PortalMeDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMe(await api<PortalMeDto>("portal/me"));
      setState("ready");
    } catch {
      setState("none");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") return <Loading />;
  if (state === "none" || !me) {
    return (
      <p className="text-sm text-stone-500">
        No pudimos cargar tu información. Reintentá en un momento; si el problema
        sigue, escribile a tu profesional.
      </p>
    );
  }

  const weightSeries = me.metrics
    .filter((m) => m.weightKg != null)
    .map((m) => ({ label: fmtDate(m.measuredAt), value: m.weightKg as number }));

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}

      {me.professionals.length > 0 && (
        <p className="text-sm text-stone-500">
          Te acompaña{me.professionals.length > 1 ? "n" : ""}:{" "}
          <span className="text-stone-800">{me.professionals.join(", ")}</span>
        </p>
      )}

      <TodayMeals plan={me.plan} canSelfReport={me.canSelfReport} />

      <PortalAppointments />

      <PortalReportsCard />

      <Card>
        <SectionHeading className="mb-4">Tu evolución</SectionHeading>
        <div className="mb-4 text-xs uppercase tracking-widest text-stone-500">Peso (kg)</div>
        <LineChart data={weightSeries} unit="kg" />

        {me.canSelfReport && <SelfReport onAdded={load} onError={setError} />}

        {me.metrics.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-4 font-medium">Fecha</th>
                  <th className="py-2 pr-4 font-medium">Peso</th>
                  <th className="py-2 pr-4 font-medium">% Grasa</th>
                  <th className="py-2 pr-4 font-medium">Cintura</th>
                  <th className="py-2 pr-4 font-medium">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {[...me.metrics].reverse().map((m) => (
                  <tr key={m.id} className="text-stone-800">
                    <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(m.measuredAt)}</td>
                    <td className="py-2 pr-4">{m.weightKg != null ? `${m.weightKg} kg` : "—"}</td>
                    <td className="py-2 pr-4">{m.bodyFatPct != null ? `${m.bodyFatPct} %` : "—"}</td>
                    <td className="py-2 pr-4">{m.waistCm != null ? `${m.waistCm} cm` : "—"}</td>
                    <td className="py-2 pr-4 text-xs text-stone-500">
                      {m.recordedByRole === "patient" ? "Vos" : m.recordedByName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {me.profile.clinical && <ClinicalCard clinical={me.profile.clinical} goal={me.profile.goal} />}

      {me.modules.includes("agents") && (
        <PortalAssistant hasAssignedProfessional={me.hasAssignedProfessional} />
      )}
    </div>
  );
}

/**
 * "Lo que te toca hoy": las comidas del plan activo para la fecha, y el registro de
 * adherencia (un toque por comida + cómo se sintió). Se puede completar el de ayer.
 */
function TodayMeals({ plan, canSelfReport }: { plan: PortalMeDto["plan"]; canSelfReport: boolean }) {
  const [offset, setOffset] = useState<0 | -1>(0);
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const date = isoDay(day);
  const label = day.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const tracking = canSelfReport && plan != null;
  if (!plan) {
    return (
      <Card>
        <SectionHeading className="mb-3">Lo que te toca hoy</SectionHeading>
        <EmptyState>Todavía no tenés un plan activo. Tu profesional lo va a cargar pronto.</EmptyState>
      </Card>
    );
  }
  const body = normalizeMealPlanBody(plan.body) as MealPlanBody;
  const meals = mealsForDate(body, day);
  // Sólo un total COMPLETO: con items sin macros, la suma parcial informaría mal.
  const total = macroCoverage({ meals }).complete ? dayMacros({ meals }) : null;
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <SectionHeading>{offset === 0 ? "Lo que te toca hoy" : "Lo que te tocaba ayer"}</SectionHeading>
          <p className="mt-1 text-sm text-stone-600">{label.charAt(0).toUpperCase() + label.slice(1)}</p>
        </div>
        <div className="flex items-center gap-3">
          {total?.kcal != null && (
            <span className="text-sm text-stone-600">{Math.round(total.kcal)} kcal en el día</span>
          )}
          {tracking && (
            <div role="group" aria-label="Día" className="flex rounded-full border border-stone-200 p-0.5 text-xs">
              {([0, -1] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={offset === o}
                  onClick={() => setOffset(o)}
                  className={`rounded-full px-2.5 py-1 transition ${offset === o ? "bg-brand text-brand-fg" : "text-stone-600"}`}
                >
                  {o === 0 ? "Hoy" : "Ayer"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {meals.length === 0 ? (
        <EmptyState>Tu plan no tiene comidas cargadas para este día.</EmptyState>
      ) : tracking ? (
        <TrackedMeals key={date} date={date} meals={meals} />
      ) : (
        <ol className="space-y-3">
          {meals.map((m, i) => (
            <TodayMeal key={i} meal={m} />
          ))}
        </ol>
      )}
      <Link href="/app/plan" className={buttonClass("secondary", "sm", "mt-5")}>
        Ver el plan completo <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </Card>
  );
}

function TrackedMeals({ date, meals }: { date: string; meals: PlanMeal[] }) {
  const { logs, checkin, setStatus, saveCheckin } = useDayAdherence(date);
  return (
    <>
      <ol className="space-y-4">
        {meals.map((m, i) => (
          <TodayMeal key={i} meal={m}>
            <MealCheck mealName={m.name} status={logs[m.name]} onChange={(s) => void setStatus(m.name, s)} />
          </TodayMeal>
        ))}
      </ol>
      <DayCheckin checkin={checkin} onSave={(p) => void saveCheckin(p)} />
      <DailyReminder />
    </>
  );
}

function TodayMeal({ meal, children }: { meal: PlanMeal; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
        <Utensils className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-stone-900">
          {meal.name}
          {meal.time && <span className="ml-2 text-sm font-normal text-stone-500">{meal.time}</span>}
        </p>
        <ul className="mt-0.5 text-sm text-stone-700">
          {meal.items.map((it, j) => (
            <li key={j}>
              {it.qty != null && (
                <span className="text-stone-500">
                  {it.qty}
                  {it.unit ? ` ${it.unit}` : ""}{" "}
                </span>
              )}
              {it.text}
            </li>
          ))}
        </ul>
        {children}
      </div>
    </li>
  );
}

function ClinicalCard({
  clinical,
  goal,
}: {
  clinical: NonNullable<PortalMeDto["profile"]["clinical"]>;
  goal: string | null;
}) {
  const allRows: [string, string | null][] = [
    ["Objetivo", goal],
    ["Motivo de consulta", clinical.reasonForConsult],
    ["Antecedentes médicos", clinical.medicalHistory],
    ["Alergias / intolerancias", clinical.allergies],
    ["Medicación actual", clinical.currentMedication],
    ["Patologías diagnosticadas", clinical.diagnosedConditions],
    ["Antecedentes familiares", clinical.familyHistory],
  ];
  // Sólo lo que el paciente tiene permitido ver (el resto llega null por la
  // visibilidad por campo). Si no hay nada, no mostramos una pared de "—".
  const rows = allRows.filter(([, value]) => value);
  if (rows.length === 0) return null;
  return (
    <Card>
      <SectionHeading className="mb-4">Tus datos de salud</SectionHeading>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-stone-500">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-line text-sm text-stone-800">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function SelfReport({
  onAdded,
  onError,
}: {
  onAdded: () => void;
  onError: (e: string) => void;
}) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [open, setOpen] = useState(false);
  const [measuredAt, setMeasuredAt] = useState(today);
  const [weightKg, setWeightKg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!weightKg.trim()) return;
    setBusy(true);
    onError("");
    try {
      await api("portal/me/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measuredAt, weightKg: Number(weightKg) }),
      });
      setWeightKg("");
      setOpen(false);
      onAdded();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mt-4">
        + Registrar mi peso
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 p-3">
      <label className="block">
        <span className="mb-1 block text-xs text-stone-500">Fecha</span>
        <Input type="date" value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-stone-500">Peso (kg)</span>
        <Input type="number" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
      </label>
      <Button type="submit" disabled={busy || !weightKg.trim()}>
        {busy ? "Guardando…" : "Guardar"}
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </form>
  );
}
