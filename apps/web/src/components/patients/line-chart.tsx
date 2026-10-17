"use client";

/**
 * Gráfico de línea minimalista en SVG (sin dependencias). Para una serie temporal
 * corta (evolución de una métrica). Responsive vía viewBox; acento de marca.
 */
export function LineChart({
  data,
  unit = "",
  height = 160,
}: {
  data: { label: string; value: number }[];
  unit?: string;
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <p className="text-sm text-stone-500">
        Cargá al menos dos mediciones para ver la evolución.
      </p>
    );
  }

  const W = 600;
  const H = height;
  const padX = 8;
  const padY = 16;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (W - padX * 2) / (data.length - 1);

  const x = (i: number) => padX + i * stepX;
  const y = (v: number) => padY + (H - padY * 2) * (1 - (v - min) / span);

  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const last = data[data.length - 1]!;
  const first = data[0]!;
  const delta = last.value - first.value;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-2xl font-semibold text-stone-900">
          {last.value}
          <span className="ml-1 text-sm font-normal text-stone-500">{unit}</span>
        </span>
        <span
          className={
            "text-sm font-medium " +
            (delta < 0
              ? "text-emerald-600"
              : delta > 0
                ? "text-amber-600"
                : "text-stone-500")
          }
        >
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)} {unit} desde el inicio
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Evolución (${unit}): de ${first.value} a ${last.value}`}
      >
        <polyline
          points={points}
          fill="none"
          stroke="rgb(var(--brand-rgb))"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {data.map((d, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(d.value)}
            r={2.5}
            fill="rgb(var(--brand-rgb))"
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-stone-500">
        <span>{first.label}</span>
        <span>{last.label}</span>
      </div>
    </div>
  );
}
