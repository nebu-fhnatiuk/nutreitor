"use client";

import { useEffect, useState } from "react";
import { fmtMinutes, type EfficiencyDto, type ProfessionalEfficiencyDto } from "@nutreitor/shared";

import { Card, cn, SectionHeading } from "@/components/ui";
import { api } from "@/lib/api";

const RANGES = [30, 90] as const;

/** `mine`: sólo la fila propia (la admin que atiende ve lo suyo, no al equipo). */
function useEfficiency(days: number, mine = false) {
  const [data, setData] = useState<EfficiencyDto | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setData(null);
    api<EfficiencyDto>(`efficiency?days=${days}${mine ? "&mine=true" : ""}`)
      .then(setData)
      .catch(() => setFailed(true));
  }, [days, mine]);
  return { data, failed };
}

/** Plantilla + NUTRI sobre lo guardado con dato de origen: cuánto se parte de algo hecho. */
function reuse(p: ProfessionalEfficiencyDto): string {
  const s = p.plans.bySource;
  const known = s.scratch + s.previous + s.template + s.nutri;
  if (!known) return "—";
  return `${Math.round(((s.template + s.nutri) / known) * 100)} %`;
}

function RangeToggle({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div role="group" aria-label="Período" className="flex rounded-full border border-stone-200 p-0.5 text-xs">
      {RANGES.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={days === d}
          onClick={() => onChange(d)}
          className={cn("rounded-full px-2.5 py-1 transition", days === d ? "bg-brand text-brand-fg" : "text-stone-600")}
        >
          {d} días
        </button>
      ))}
    </div>
  );
}

const Tile = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-xl bg-stone-50 px-3 py-2.5">
    <div className="text-xs text-stone-500">{label}</div>
    <div className="mt-0.5 text-lg font-semibold tabular-nums text-stone-900">{value}</div>
    {hint && <div className="text-[11px] text-stone-500">{hint}</div>}
  </div>
);

/** "Hoy" del profesional: sus números del período (Fase 4.4). */
export function MyEfficiency() {
  const [days, setDays] = useState<number>(30);
  const { data, failed } = useEfficiency(days, true);
  const me = data?.professionals[0];
  if (failed) return null;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionHeading>Tus números</SectionHeading>
        <RangeToggle days={days} onChange={setDays} />
      </div>
      {!me ? (
        <p className="text-sm text-stone-500">{data ? "Sin datos todavía." : "Cargando…"}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Armado de un plan" value={fmtMinutes(me.plans.medianMinutes)} hint={me.plans.measured < me.plans.saved ? `mediana · ${me.plans.measured} medidos de ${me.plans.saved}` : `mediana · ${me.plans.saved} guardados`} />
          <Tile label="Partiendo de plantilla o NUTRI" value={reuse(me)} />
          <Tile label="Adherencia de tus pacientes" value={me.adherence.pct == null ? "—" : `${me.adherence.pct} %`} hint={`${me.adherence.logs} registros`} />
          <Tile
            label="Tiempo de respuesta"
            value={fmtMinutes(me.replies.medianMinutes)}
            hint={me.replies.pending ? `${me.replies.pending} sin responder` : "mediana"}
          />
        </div>
      )}
    </Card>
  );
}

/** Resumen de la admin: eficiencia del equipo por profesional (Fase 4.4). */
export function TeamEfficiency() {
  const [days, setDays] = useState<number>(30);
  const { data, failed } = useEfficiency(days);
  if (failed) return null;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionHeading>Eficiencia del equipo</SectionHeading>
        <RangeToggle days={days} onChange={setDays} />
      </div>
      {!data ? (
        <p className="text-sm text-stone-500">Cargando…</p>
      ) : data.professionals.length === 0 ? (
        <p className="text-sm text-stone-500">Todavía no hay profesionales activos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="py-2 pr-4 font-medium">Profesional</th>
                <th className="py-2 pr-4 font-medium">Pacientes</th>
                <th className="py-2 pr-4 font-medium">Planes</th>
                <th className="py-2 pr-4 font-medium">Armado (mediana)</th>
                <th className="py-2 pr-4 font-medium">Plantilla/NUTRI</th>
                <th className="py-2 pr-4 font-medium">Adherencia</th>
                <th className="py-2 pr-4 font-medium">Respuesta (mediana)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 tabular-nums">
              {data.professionals.map((p) => (
                <tr key={p.membershipId} className="text-stone-800">
                  <td className="py-2 pr-4 font-medium">{p.name}</td>
                  <td className="py-2 pr-4">{p.activePatients}</td>
                  <td className="py-2 pr-4">{p.plans.saved}</td>
                  <td className="py-2 pr-4">{fmtMinutes(p.plans.medianMinutes)}</td>
                  <td className="py-2 pr-4">{reuse(p)}</td>
                  <td className="py-2 pr-4">{p.adherence.pct == null ? "—" : `${p.adherence.pct} %`}</td>
                  <td className="py-2 pr-4">
                    {fmtMinutes(p.replies.medianMinutes)}
                    {p.replies.pending > 0 && <span className="ml-1 text-xs text-amber-700">({p.replies.pending} pend.)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-stone-500">
            Medianas del período. Armado: desde que se abre el editor hasta que se guarda (tope 2 h). Adherencia
            sobre lo registrado por los pacientes. Respuesta: desde el primer mensaje del paciente hasta la respuesta.
          </p>
        </div>
      )}
    </Card>
  );
}
