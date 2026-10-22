"use client";

import Link from "next/link";
import { useState } from "react";

import { cn } from "@/components/ui";
import { fmt } from "./anthro-format";

/** Un punto de la somatocarta, con las coordenadas que calcula `somatotype`. */
export interface SomatoPoint {
  id: string;
  label: string;
  /** Detalle del tooltip (fecha, "Σ endo-meso-ecto"…). */
  detail?: string;
  endo: number;
  meso: number;
  ecto: number;
  x: number;
  y: number;
  href?: string;
}

/**
 * Somatocarta de Heath-Carter (KAN-71). Ubicación exacta: x = ecto − endo,
 * y = 2·meso − (endo + ecto). La carta clásica comprime el eje Y por √3 para que
 * los polos puros (7-1-1, 1-7-1, 1-1-7 → (−6,−6), (0,12), (6,−6)) formen un
 * triángulo equilátero; acá se hace igual.
 *
 * - `points`: un punto por deportista (plantel). Opcional, un promedio.
 * - `trail`: la evolución de uno (ficha), en orden cronológico; el último resalta.
 */
export function Somatochart({
  points = [],
  trail,
  mean,
  className,
  label,
}: {
  points?: SomatoPoint[];
  trail?: SomatoPoint[];
  mean?: { x: number; y: number } | null;
  className?: string;
  /** Nombre accesible del gráfico. */
  label: string;
}) {
  const [active, setActive] = useState<SomatoPoint | null>(null);
  const all = [...points, ...(trail ?? [])];

  // Dominio: los polos más los puntos (un somatotipo extremo puede salir del triángulo).
  const xs = [-8, 8, ...all.map((p) => p.x)];
  // −10: el arco inferior (endo–ecto) baja ~2,8 unidades por debajo de los polos.
  const ys = [-10, 13, ...all.map((p) => p.y)];
  const minX = Math.min(...xs) - 0.5;
  const maxX = Math.max(...xs) + 0.5;
  const minY = Math.min(...ys) - 0.5;
  const maxY = Math.max(...ys) + 0.5;
  const K = 20; // px por unidad en x
  const KY = K / Math.sqrt(3);
  const W = (maxX - minX) * K;
  const H = (maxY - minY) * KY;
  const px = (x: number) => (x - minX) * K;
  const py = (y: number) => (maxY - y) * KY;

  const endoP = [px(-6), py(-6)] as const;
  const mesoP = [px(0), py(12)] as const;
  const ectoP = [px(6), py(-6)] as const;
  const side = Math.hypot(ectoP[0] - endoP[0], ectoP[1] - endoP[1]);
  // Contorno: tres arcos de radio = lado (triángulo de Reuleaux), como la carta clásica.
  const outline = `M ${endoP[0]} ${endoP[1]} A ${side} ${side} 0 0 1 ${mesoP[0]} ${mesoP[1]} A ${side} ${side} 0 0 1 ${ectoP[0]} ${ectoP[1]} A ${side} ${side} 0 0 1 ${endoP[0]} ${endoP[1]} Z`;
  const center = [px(0), py(0)] as const;

  const trailPts = trail ?? [];
  const lastTrail = trailPts[trailPts.length - 1];

  return (
    <figure className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        className="h-auto w-full select-none"
        onMouseLeave={() => setActive(null)}
      >
        <path d={outline} className="fill-stone-100/60 stroke-stone-300" strokeWidth={1.2} />
        {[endoP, mesoP, ectoP].map(([x, y], i) => (
          <line key={i} x1={center[0]} y1={center[1]} x2={x} y2={y} className="stroke-stone-300" strokeDasharray="3 4" strokeWidth={1} />
        ))}
        <text x={mesoP[0]} y={mesoP[1] - 8} textAnchor="middle" className="fill-stone-500 font-display text-[11px] font-semibold uppercase tracking-wider">
          Mesomorfo
        </text>
        <text x={endoP[0] - 4} y={endoP[1] + 16} textAnchor="middle" className="fill-stone-500 font-display text-[11px] font-semibold uppercase tracking-wider">
          Endomorfo
        </text>
        <text x={ectoP[0] + 4} y={ectoP[1] + 16} textAnchor="middle" className="fill-stone-500 font-display text-[11px] font-semibold uppercase tracking-wider">
          Ectomorfo
        </text>

        {trailPts.length > 1 && (
          <polyline
            points={trailPts.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")}
            fill="none"
            className="stroke-brand"
            strokeOpacity={0.55}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeDasharray="4 3"
          />
        )}

        {mean && (
          <g aria-hidden>
            <circle cx={px(mean.x)} cy={py(mean.y)} r={9} fill="none" className="stroke-stone-900" strokeWidth={1.5} />
            <line x1={px(mean.x) - 13} x2={px(mean.x) + 13} y1={py(mean.y)} y2={py(mean.y)} className="stroke-stone-900" strokeWidth={1} />
            <line y1={py(mean.y) - 13} y2={py(mean.y) + 13} x1={px(mean.x)} x2={px(mean.x)} className="stroke-stone-900" strokeWidth={1} />
          </g>
        )}

        {trailPts.map((p, i) => {
          const last = p === lastTrail;
          return (
            <Dot
              key={p.id}
              p={p}
              cx={px(p.x)}
              cy={py(p.y)}
              r={last ? 7 : 4.5}
              className="fill-brand stroke-surface"
              opacity={last ? 1 : 0.5 + (0.35 * i) / Math.max(trailPts.length - 1, 1)}
              onActive={setActive}
            />
          );
        })}
        {points.map((p) => (
          <Dot key={p.id} p={p} cx={px(p.x)} cy={py(p.y)} r={6} className="fill-accent2 stroke-surface" onActive={setActive} />
        ))}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-stone-200 bg-surface px-3 py-2 text-sm shadow-lg"
          style={{ left: `${(px(active.x) / W) * 100}%`, top: `calc(${(py(active.y) / H) * 100}% - 10px)` }}
        >
          <p className="whitespace-nowrap font-display font-bold uppercase text-stone-900">{active.label}</p>
          <p className="whitespace-nowrap font-display tabular-nums text-stone-600">
            {fmt(active.endo)} · {fmt(active.meso)} · {fmt(active.ecto)}
          </p>
          {active.detail && <p className="whitespace-nowrap text-xs text-stone-500">{active.detail}</p>}
        </div>
      )}
    </figure>
  );
}

function Dot({
  p,
  cx,
  cy,
  r,
  className,
  opacity,
  onActive,
}: {
  p: SomatoPoint;
  cx: number;
  cy: number;
  r: number;
  className: string;
  opacity?: number;
  onActive: (p: SomatoPoint | null) => void;
}) {
  const aria = `${p.label}: somatotipo ${fmt(p.endo)}, ${fmt(p.meso)}, ${fmt(p.ecto)}${p.detail ? ` (${p.detail})` : ""}`;
  const circle = (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      className={cn(className, "transition-[r]")}
      strokeWidth={2}
      opacity={opacity}
    />
  );
  const handlers = {
    onMouseEnter: () => onActive(p),
    onFocus: () => onActive(p),
    onBlur: () => onActive(null),
  };
  // Área de toque mayor que el punto (44 px en celular se logra con el halo invisible).
  const hit = <circle cx={cx} cy={cy} r={Math.max(r, 11)} fill="transparent" />;
  if (p.href) {
    return (
      <Link href={p.href} aria-label={aria} className="cursor-pointer focus-visible:outline-none [&:focus-visible>circle:last-child]:stroke-brand" {...handlers}>
        {hit}
        {circle}
      </Link>
    );
  }
  return (
    <g tabIndex={0} role="img" aria-label={aria} className="focus-visible:outline-none" {...handlers}>
      {hit}
      {circle}
    </g>
  );
}
