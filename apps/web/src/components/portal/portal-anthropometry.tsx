"use client";

import { useEffect, useState } from "react";
import type { PortalAnthropometryDto } from "@nutreitor/shared";

import { fmt, fmtMeasured } from "@/components/patients/anthro-format";
import { KerrRing } from "@/components/patients/kerr-ring";
import { LineChart } from "@/components/patients/line-chart";
import { Card, SectionHeading } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * Antropometría del deportista en su portal (ADR 0030): sólo lo que el profesional
 * marcó visible (la API ya filtra). Sin nada visible, la tarjeta no aparece.
 */
export function PortalAnthropometry() {
  const [rows, setRows] = useState<PortalAnthropometryDto[] | null>(null);

  useEffect(() => {
    api<PortalAnthropometryDto[]>("portal/me/anthropometry").then(setRows, () => setRows([]));
  }, []);

  if (!rows || rows.length === 0) return null;
  const [last, prev] = rows; // de la más nueva a la más vieja
  const l = last!;
  const sum6Series = [...rows]
    .reverse()
    .filter((r) => r.sum6 != null)
    .map((r) => ({ label: fmtMeasured(r.measuredAt), value: r.sum6 as number }));
  // Kerr no va en todas las sesiones: la última que lo tiene, contra la anterior con Kerr.
  const kerrRows = rows.filter((r) => r.kerr);
  const [kerrLast, kerrPrev] = kerrRows;
  const delta = l.sum6 != null && prev?.sum6 != null ? Math.round((l.sum6 - prev.sum6) * 10) / 10 : null;
  // Una sola ecuación: tres % graso distintos confunden al deportista. La primera que
  // aplique, en este orden (la comparación entre ecuaciones queda en la vista profesional).
  const fat = l.fatPct
    ? ([
        ["Durnin-Womersley", l.fatPct.durninWomersley],
        ["Yuhasz", l.fatPct.yuhasz],
        ["Faulkner", l.fatPct.faulkner],
      ] as const).filter(([, v]) => v != null).slice(0, 1)
    : [];

  return (
    <Card>
      <SectionHeading>Tu antropometría</SectionHeading>
      <p className="mt-1 text-sm text-stone-500">Última medición: {fmtMeasured(l.measuredAt)}</p>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {l.sum6 != null && (
          <Stat label="Σ6 pliegues" value={`${fmt(l.sum6)} mm`} sub={delta ? `${delta > 0 ? "+" : ""}${fmt(delta)} mm vs. la anterior` : undefined} />
        )}
        {fat.map(([label, v]) => (
          <Stat key={label} label={`% graso (${label})`} value={`${fmt(v)} %`} />
        ))}
        {l.somatotype && (
          <Stat label="Somatotipo" value={`${fmt(l.somatotype.endo)} · ${fmt(l.somatotype.meso)} · ${fmt(l.somatotype.ecto)}`} sub="endo · meso · ecto" />
        )}
      </dl>
      {kerrLast?.kerr && (
        <div className="mt-6">
          <div className="mb-3 text-xs uppercase tracking-widest text-stone-500">
            Tu composición corporal · {fmtMeasured(kerrLast.measuredAt)}
          </div>
          <KerrRing
            kerr={kerrLast.kerr}
            previous={kerrPrev?.kerr}
            previousLabel={kerrPrev ? fmtMeasured(kerrPrev.measuredAt) : undefined}
          />
        </div>
      )}
      {sum6Series.length > 1 && (
        <div className="mt-6">
          <div className="mb-3 text-xs uppercase tracking-widest text-stone-500">Σ6 pliegues (mm)</div>
          <LineChart data={sum6Series} unit="mm" />
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-stone-900">{value}</dd>
      {sub && <dd className="text-xs text-stone-500">{sub}</dd>}
    </div>
  );
}
