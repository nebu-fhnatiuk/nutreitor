"use client";

import { planAlertKey, type PlanAlert, type PlanAlertReviewDto, type PlanAlertsResult } from "@nutreitor/shared";

import { ZoneBadge, ZoneMark } from "@/components/ui";

const inputCls =
  "w-full rounded-lg border border-stone-200 bg-surface px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

/** Motivos de las alertas que el profesional decidió mantener, por `planAlertKey`. */
export type KeptAlerts = Record<string, string>;

/** Alertas importantes marcadas para mantener que todavía no tienen motivo. */
export function keptWithoutReason(alerts: PlanAlert[], kept: KeptAlerts): PlanAlert[] {
  return alerts.filter((a) => a.level === "important" && planAlertKey(a) in kept && !kept[planAlertKey(a)]!.trim());
}

/** Decisiones para mandar al guardar: solo las de alertas que siguen en el plan. */
export function alertReviewsFor(alerts: PlanAlert[], kept: KeptAlerts) {
  return alerts
    .filter((a) => planAlertKey(a) in kept)
    .map((a) => ({ rule: a.rule, day: a.day, reason: kept[planAlertKey(a)]!.trim() || null }));
}

/**
 * Alertas clínico-nutricionales del plan (KAN-97). Se recalculan mientras se edita:
 * si el profesional corrige el plan, la alerta desaparece. Las que quedan se pueden
 * mantener (en las importantes, con motivo); las demás se guardan como "sin revisar".
 * No bloquean el guardado.
 */
export function PlanAlertsPanel({
  result,
  kept,
  onChange,
}: {
  result: PlanAlertsResult;
  kept: KeptAlerts;
  onChange: (next: KeptAlerts) => void;
}) {
  const { alerts, notEvaluated, missing } = result;
  if (!alerts.length && !notEvaluated.length && !missing.length) return null;

  const toggle = (a: PlanAlert) => {
    const key = planAlertKey(a);
    const next = { ...kept };
    if (key in next) delete next[key];
    else next[key] = "";
    onChange(next);
  };

  return (
    <section aria-labelledby="plan-alerts-title" className="rounded-xl border border-stone-200 bg-surface p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="plan-alerts-title" className="font-display text-sm uppercase tracking-wide text-stone-700">
          Alertas del plan
        </h3>
        <span className="text-xs text-stone-500">Informan, no bloquean. Se registran al guardar.</span>
      </div>

      {alerts.length === 0 ? (
        <p className="text-sm text-stone-500">Sin alertas en lo que se pudo evaluar.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const key = planAlertKey(a);
            const isKept = key in kept;
            const important = a.level === "important";
            const needsReason = important && isKept && !kept[key]!.trim();
            return (
              <li key={key} className="rounded-lg border border-stone-200 p-2.5">
                <div className="flex flex-wrap items-start gap-2">
                  <ZoneBadge zone={important ? "bad" : "warn"}>{important ? "Importante" : "Informativa"}</ZoneBadge>
                  <span className="text-xs text-stone-500">{a.dayLabel}</span>
                </div>
                <p className="mt-1.5 text-sm text-stone-800">{a.message}</p>
                <p className="mt-0.5 text-xs text-stone-500">Fuente: {a.source}</p>
                <label className="mt-2 flex items-center gap-2 text-sm text-stone-700">
                  <input type="checkbox" checked={isKept} onChange={() => toggle(a)} className="h-4 w-4 accent-brand" />
                  Mantengo el plan así
                </label>
                {isKept && (
                  <div className="mt-2">
                    <input
                      value={kept[key]}
                      onChange={(e) => onChange({ ...kept, [key]: e.target.value })}
                      maxLength={500}
                      placeholder={important ? "Motivo (obligatorio)" : "Motivo (opcional)"}
                      aria-label={`Motivo para mantener: ${a.message}`}
                      aria-invalid={needsReason || undefined}
                      className={inputCls}
                    />
                    {needsReason && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-zone-bad">
                        <ZoneMark zone="bad" /> Para mantener una alerta importante escribí el motivo.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(notEvaluated.length > 0 || missing.length > 0) && (
        <ul className="mt-3 space-y-1 border-t border-stone-100 pt-2 text-xs text-stone-500">
          {notEvaluated.map((n) => (
            <li key={n.day}>
              <strong className="font-medium text-stone-600">{n.dayLabel}:</strong> sin evaluar. {n.reason}
            </li>
          ))}
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Alertas con las que se guardó una versión del plan y qué decidió el profesional
 * (KAN-97). Solo en la vista del profesional; el portal nunca las recibe.
 */
export function SavedPlanAlerts({ reviews }: { reviews: PlanAlertReviewDto[] }) {
  const kept = reviews.filter((r) => r.decision === "kept").length;
  return (
    <details className="mt-2 rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-600">
      <summary className="cursor-pointer select-none">
        Se guardó con {reviews.length} {reviews.length === 1 ? "alerta" : "alertas"}
        {kept ? ` · ${kept} ${kept === 1 ? "mantenida" : "mantenidas"}` : ""}
        {reviews.length - kept ? ` · ${reviews.length - kept} sin revisar` : ""}
      </summary>
      <ul className="mt-2 space-y-1.5">
        {reviews.map((r) => (
          <li key={`${r.rule}:${r.day}`} className="flex gap-2">
            <ZoneMark zone={r.level === "important" ? "bad" : "warn"} className="mt-1" />
            <span>
              <span className="text-stone-500">{r.dayLabel}.</span> {r.message}{" "}
              <span className="text-stone-500">
                {r.decision === "kept" ? `Mantenida${r.reason ? `: ${r.reason}` : "."}` : "Sin revisar."}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
