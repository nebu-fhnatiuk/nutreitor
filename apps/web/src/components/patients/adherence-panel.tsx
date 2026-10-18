"use client";

import { useEffect, useMemo, useState } from "react";
import {
  adherenceScore,
  adherenceStatusLabels,
  isoDay,
  type AdherenceDto,
  type AdherenceStatus,
} from "@nutreitor/shared";

import { Alert, Card, EmptyState, SectionHeading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

const DAYS = 14;

const cellStyles: Record<AdherenceStatus, string> = {
  done: "bg-emerald-600",
  partial: "bg-amber-500",
  skipped: "bg-stone-400",
};

/**
 * Adherencia del paciente (Fase 4.3), para el profesional: grilla de las últimas dos
 * semanas (comida × día), el puntaje sobre lo registrado y cómo se sintió.
 */
export function AdherencePanel({ patientId }: { patientId: string }) {
  const [data, setData] = useState<AdherenceDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dates = useMemo(() => Array.from({ length: DAYS }, (_, i) => isoDay(new Date(), i - DAYS + 1)), []);

  useEffect(() => {
    api<AdherenceDto>(`patients/${patientId}/adherence?from=${dates[0]}&to=${dates.at(-1)}`)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [patientId, dates]);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;

  const week = dates.slice(-7);
  const last7 = adherenceScore(data.logs.filter((l) => week.includes(l.date)));
  const all = adherenceScore(data.logs);
  const meals = [...new Set(data.logs.map((l) => l.mealName))];
  const byKey = new Map(data.logs.map((l) => [`${l.date}|${l.mealName}`, l]));
  const checkins = new Map(data.checkins.map((c) => [c.date, c]));
  const scales = [
    { key: "hunger", label: "Hambre" },
    { key: "energy", label: "Energía" },
    { key: "mood", label: "Ánimo" },
  ] as const;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading>Adherencia al plan</SectionHeading>
        {all.pct != null && (
          <p className="text-sm text-stone-600">
            Últimos 7 días: <strong className="font-semibold text-stone-900">{last7.pct ?? "—"}{last7.pct != null && " %"}</strong>
            <span className="mx-2 text-stone-300">·</span>
            14 días: <strong className="font-semibold text-stone-900">{all.pct} %</strong>
          </p>
        )}
      </div>
      {data.logs.length === 0 && data.checkins.length === 0 ? (
        <EmptyState>
          El paciente todavía no registró nada. Desde su portal marca cada comida (cumplí / en parte /
          no) y cómo se sintió en el día.
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="text-stone-500">
                  <th className="pr-3 text-left font-medium" />
                  {dates.map((d) => (
                    <th key={d} className="w-7 px-0.5 pb-1 text-center font-normal">
                      {new Date(`${d}T12:00:00`).toLocaleDateString("es-AR", { weekday: "narrow" })}
                      <br />
                      {Number(d.slice(8))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meals.map((m) => (
                  <tr key={m}>
                    <th className="max-w-[9rem] truncate py-0.5 pr-3 text-left font-normal text-stone-700">{m}</th>
                    {dates.map((d) => {
                      const log = byKey.get(`${d}|${m}`);
                      return (
                        <td key={d} className="px-0.5 py-0.5 text-center">
                          <span
                            title={log ? `${adherenceStatusLabels[log.status]}${log.note ? ` — ${log.note}` : ""}` : "Sin registro"}
                            className={`inline-block h-5 w-5 rounded ${log ? cellStyles[log.status] : "bg-stone-100"}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {scales.map((sc) => (
                  <tr key={sc.key} className="text-stone-600">
                    <th className="py-0.5 pr-3 text-left font-normal text-stone-500">{sc.label} (1–5)</th>
                    {dates.map((d) => (
                      <td key={d} className="px-0.5 py-0.5 text-center tabular-nums">
                        {checkins.get(d)?.[sc.key] ?? <span className="text-stone-300">·</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
            {(Object.keys(cellStyles) as AdherenceStatus[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={`inline-block h-3 w-3 rounded ${cellStyles[s]}`} />
                {adherenceStatusLabels[s]}
              </span>
            ))}
            <span>El % se calcula sobre lo registrado (en parte = ½).</span>
          </div>
          {data.checkins.some((c) => c.note) && (
            <ul className="mt-4 space-y-1 border-t border-stone-100 pt-3 text-sm text-stone-700">
              {[...data.checkins]
                .filter((c) => c.note)
                .reverse()
                .slice(0, 5)
                .map((c) => (
                  <li key={c.date}>
                    <span className="mr-2 text-xs text-stone-500">
                      {new Date(`${c.date}T12:00:00`).toLocaleDateString("es-AR")}
                    </span>
                    “{c.note}”
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
