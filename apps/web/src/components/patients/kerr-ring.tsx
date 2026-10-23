import type { PortalKerr } from "@nutreitor/shared";

import { cn } from "@/components/ui";
import { fmt } from "./anthro-format";

type Key = "muscle" | "adipose" | "bone" | "residual" | "skin";

/**
 * Componentes en el orden del anillo (sentido horario desde arriba). Los colores
 * no usan los de zona (rojo/ámbar/verde significan "fuera / límite / en rango"):
 * marca y segundo color del club para músculo y adiposo, y neutros para el resto.
 */
const PARTS: { key: Key; label: string; kg: keyof PortalKerr; stroke: string; dot: string }[] = [
  { key: "muscle", label: "Muscular", kg: "muscleKg", stroke: "stroke-[rgb(var(--brand-rgb))]", dot: "bg-brand" },
  { key: "adipose", label: "Adiposa", kg: "adiposeKg", stroke: "stroke-accent2", dot: "bg-accent2" },
  { key: "bone", label: "Ósea", kg: "boneKg", stroke: "stroke-stone-400", dot: "bg-stone-400" },
  { key: "residual", label: "Residual", kg: "residualKg", stroke: "stroke-sky-500", dot: "bg-sky-500" },
  { key: "skin", label: "Piel", kg: "skinKg", stroke: "stroke-stone-600", dot: "bg-stone-600" },
];

/**
 * Anillo de composición corporal (Kerr, 5 componentes; KAN-72): cada arco es el %
 * de la masa estimada, con el índice músculo/óseo en el centro. La lista al lado
 * da kg, % y la diferencia en kg contra la medición anterior con Kerr.
 */
export function KerrRing({
  kerr,
  previous,
  previousLabel,
  className,
}: {
  kerr: PortalKerr;
  previous?: PortalKerr | null;
  /** "15/10": fecha de la medición contra la que se compara. */
  previousLabel?: string;
  className?: string;
}) {
  const R = 70;
  const C = 2 * Math.PI * R;
  const GAP = 3; // px entre arcos
  let offset = 0;
  const arcs = PARTS.map((p) => {
    const pct = kerr.pct[p.key];
    const len = Math.max((pct / 100) * C - GAP, 0);
    const arc = { ...p, pct, len, offset };
    offset += (pct / 100) * C;
    return arc;
  });
  const mbiDelta = previous ? Math.round((kerr.muscleBoneIndex - previous.muscleBoneIndex) * 100) / 100 : null;

  return (
    <div className={cn("flex flex-col items-center gap-6 sm:flex-row sm:items-center", className)}>
      <figure className="relative h-48 w-48 shrink-0">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" role="img" aria-label={ariaLabel(kerr)}>
          <circle cx={90} cy={90} r={R} fill="none" className="stroke-stone-100" strokeWidth={22} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={90}
              cy={90}
              r={R}
              fill="none"
              className={a.stroke}
              strokeWidth={22}
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={-a.offset}
            />
          ))}
        </svg>
        <figcaption className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-[11px] font-semibold uppercase tracking-wider text-stone-500">Músculo / óseo</span>
          <span className="font-display text-4xl font-bold leading-none tabular-nums text-stone-900">{fmt(kerr.muscleBoneIndex, 2)}</span>
          {mbiDelta !== null && mbiDelta !== 0 && (
            <span className={cn("font-display text-sm font-semibold tabular-nums", mbiDelta > 0 ? "text-zone-ok" : "text-zone-warn")}>
              {mbiDelta > 0 ? "▲" : "▼"} {fmt(Math.abs(mbiDelta), 2)}
            </span>
          )}
        </figcaption>
      </figure>

      <table className="w-full max-w-sm text-sm">
        <thead>
          <tr className="text-left font-display text-[11px] uppercase tracking-wider text-stone-500">
            <th className="pb-1.5 font-semibold">Componente</th>
            <th className="pb-1.5 text-right font-semibold">kg</th>
            <th className="pb-1.5 text-right font-semibold">%</th>
            {previous && <th className="pb-1.5 text-right font-semibold">vs. {previousLabel ?? "anterior"}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {PARTS.map((p) => {
            const kg = kerr[p.kg] as number;
            const d = previous ? Math.round((kg - (previous[p.kg] as number)) * 10) / 10 : null;
            return (
              <tr key={p.key}>
                <td className="py-1.5">
                  <span className="flex items-center gap-2 text-stone-700">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", p.dot)} aria-hidden />
                    {p.label}
                  </span>
                </td>
                <td className="py-1.5 text-right font-display text-base font-semibold tabular-nums text-stone-900">{fmt(kg)}</td>
                <td className="py-1.5 text-right tabular-nums text-stone-600">{fmt(kerr.pct[p.key])}</td>
                {previous && (
                  <td className="py-1.5 text-right tabular-nums text-stone-600">
                    {d === null || d === 0 ? "=" : `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}`}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ariaLabel(k: PortalKerr): string {
  const parts = PARTS.map((p) => `${p.label} ${fmt(k[p.kg] as number)} kg (${fmt(k.pct[p.key])} %)`).join(", ");
  return `Composición corporal en 5 componentes: ${parts}. Índice músculo/óseo ${fmt(k.muscleBoneIndex, 2)}.`;
}
