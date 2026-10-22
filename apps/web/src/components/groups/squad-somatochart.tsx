"use client";

import type { GroupAnthropometryRowDto } from "@nutreitor/shared";
import { useState } from "react";

import { fmt, fmtMeasured, val } from "@/components/patients/anthro-format";
import { Somatochart, type SomatoPoint } from "@/components/patients/somatochart";
import { Card, SectionHeading, Select } from "@/components/ui";

type Since = "all" | "30" | "90" | "year";
const SINCE_LABEL: Record<Since, string> = {
  all: "Todas las mediciones",
  "30": "Últimos 30 días",
  "90": "Últimos 90 días",
  year: "Este año",
};

function cutoff(since: Since, today = new Date()): string | null {
  if (since === "all") return null;
  if (since === "year") return `${today.getFullYear()}-01-01`;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Number(since));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Somatocarta del plantel (KAN-71): la última medición de cada deportista como un
 * punto, con su nombre al pasar el mouse, y el somatotipo medio del plantel (la
 * media de cada componente, ubicada con la misma fórmula). Filtro por fecha de
 * medición.
 */
export function SquadSomatochart({ rows, patientsPath }: { rows: GroupAnthropometryRowDto[]; patientsPath: string }) {
  const [since, setSince] = useState<Since>("all");
  const from = cutoff(since);

  const points: SomatoPoint[] = rows.flatMap((r) => {
    const so = r.last ? val(r.last.results.somatotype) : null;
    if (!so || !r.last || (from && r.last.measuredAt < from)) return [];
    return [{ id: r.patientId, label: r.fullName, detail: fmtMeasured(r.last.measuredAt), href: `${patientsPath}/${r.patientId}`, ...so }];
  });
  const withSomato = rows.filter((r) => r.last && val(r.last.results.somatotype)).length;
  if (withSomato === 0) return null;

  const m = (k: "endo" | "meso" | "ecto") => points.reduce((a, p) => a + p[k], 0) / points.length;
  const mean = points.length > 1 ? { endo: m("endo"), meso: m("meso"), ecto: m("ecto") } : null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionHeading>Somatocarta del plantel</SectionHeading>
          <p className="mt-1 text-sm text-stone-500">
            Última medición de cada deportista · {points.length} de {rows.length}
            {mean && (
              <>
                {" "}
                · promedio <span className="font-display font-semibold tabular-nums text-stone-700">
                  {fmt(mean.endo)}-{fmt(mean.meso)}-{fmt(mean.ecto)}
                </span>
              </>
            )}
          </p>
        </div>
        <Select value={since} onChange={(e) => setSince(e.target.value as Since)} className="w-auto py-1.5" aria-label="Medidos desde">
          {(Object.keys(SINCE_LABEL) as Since[]).map((k) => (
            <option key={k} value={k}>
              {SINCE_LABEL[k]}
            </option>
          ))}
        </Select>
      </div>
      {points.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">Nadie se midió en ese período.</p>
      ) : (
        <Somatochart
          points={points}
          mean={mean && { x: mean.ecto - mean.endo, y: 2 * mean.meso - (mean.endo + mean.ecto) }}
          label={`Somatocarta del plantel: ${points.length} deportistas`}
          className="mx-auto mt-4 max-w-xl"
        />
      )}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent2" aria-hidden /> Deportista (tocalo para ver la ficha)
        </span>
        {mean && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-stone-900" aria-hidden /> Promedio del plantel
          </span>
        )}
      </p>
    </Card>
  );
}
