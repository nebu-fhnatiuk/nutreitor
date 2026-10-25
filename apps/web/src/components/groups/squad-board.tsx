import { BOARD_THRESHOLDS, type GroupBoardDto, type GroupBoardRowDto } from "@nutreitor/shared";
import Link from "next/link";

import { fmt } from "@/components/patients/anthro-format";
import { ZONE_LABEL, ZoneMark, cn, zoneFill, zoneSoft, zoneText, type Zone } from "@/components/ui";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Pizarra del plantel (KAN-70, tema Estadio): la pantalla del lunes a la mañana.
 * KPIs del plantel arriba y una tarjeta por deportista, ya ordenadas por la API
 * (fuera → límite → en rango). Cada tarjeta lleva el aviso más grave como titular y
 * el color de zona siempre con forma y texto.
 */
export function SquadBoard({ board, patientsPath }: { board: GroupBoardDto; patientsPath: string }) {
  const rows = board.rows;
  const attention = rows.filter((r) => r.status.zone !== "ok").length;
  // El KPI toma el color de la zona más grave del plantel.
  const worst: Zone | null = rows.some((r) => r.status.zone === "bad") ? "bad" : attention > 0 ? "warn" : null;
  const sum6 = avg(rows.flatMap((r) => (r.sum6 === null ? [] : [r.sum6])));
  const sum6Delta = avg(rows.flatMap((r) => (r.sum6Delta === null ? [] : [r.sum6Delta])));
  const withSweat = rows.filter((r) => r.lossPct !== null);
  const dehydrated = withSweat.filter((r) => r.lossPct! > BOARD_THRESHOLDS.lossWarnPct).length;
  const adherence = avg(rows.flatMap((r) => (r.adherence7 === null ? [] : [r.adherence7])));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-stone-200 bg-surface lg:grid-cols-4">
        <Kpi label="Necesitan atención" className={worst ? zoneSoft[worst] : undefined}>
          <span className={worst ? zoneText[worst] : undefined}>{attention}</span>
          <Small> / {rows.length}</Small>
        </Kpi>
        <Kpi label="Σ6 promedio">
          {sum6 === null ? "—" : fmt(sum6)}
          {sum6Delta !== null && sum6Delta !== 0 && (
            <Small className={sum6Delta < 0 ? "text-zone-ok" : "text-zone-warn"}>
              {" "}
              {sum6Delta < 0 ? "▼" : "▲"}
              {fmt(Math.abs(sum6Delta))}
            </Small>
          )}
        </Kpi>
        <Kpi label={`Más de ${BOARD_THRESHOLDS.lossWarnPct} % de pérdida`}>
          <span className={dehydrated > 0 ? "text-zone-warn" : undefined}>{withSweat.length ? dehydrated : "—"}</span>
          {withSweat.length > 0 && <Small> / {withSweat.length} medidos</Small>}
        </Kpi>
        <Kpi label="Adherencia semanal">
          {adherence === null ? "—" : Math.round(adherence)}
          {adherence !== null && <Small> %</Small>}
        </Kpi>
      </div>

      <Coverage c={board.coverage} today={board.today} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="font-display text-base font-semibold uppercase tracking-wider text-stone-700">
          La pizarra · quién necesita atención
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500" aria-label="Referencias">
          {(["bad", "warn", "ok"] as Zone[]).map((z) => (
            <li key={z} className="flex items-center gap-1.5">
              <ZoneMark zone={z} />
              {ZONE_LABEL[z]}
            </li>
          ))}
        </ul>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <li key={r.patientId}>
            <BoardCard row={r} href={`${patientsPath}/${r.patientId}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BoardCard({ row: r, href }: { row: GroupBoardRowDto; href: string }) {
  const zone = r.status.zone;
  const [head, ...rest] = r.status.flags;
  return (
    <Link
      href={href}
      className="group flex h-full overflow-hidden rounded-2xl border border-stone-200 bg-surface transition hover:border-stone-300 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <span className={cn("w-1.5 shrink-0", zoneFill[zone])} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 font-display text-xl font-bold text-stone-500">
            {r.fullName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-bold uppercase leading-tight text-stone-900 group-hover:text-brand">
              {r.fullName}
            </p>
            <p
              className={cn(
                "mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-display text-sm font-semibold uppercase tracking-wide",
                zoneText[zone],
                zoneSoft[zone],
              )}
            >
              <ZoneMark zone={zone} />
              {head ? head.text : ZONE_LABEL.ok}
            </p>
            {rest.length > 0 && (
              <p className="mt-1 text-xs text-stone-500">{rest.map((f) => f.text).join(" · ")}</p>
            )}
          </div>
        </div>
        <p className={cn("truncate text-sm", r.activePlan ? "text-stone-600" : "text-stone-500")}>
          {r.activePlan ? `Plan: ${r.activePlan.title} · v${r.activePlan.version}` : "Sin plan vigente"}
        </p>
        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-stone-200 pt-3">
          <Mini label="Σ6" value={r.sum6 === null ? "—" : fmt(r.sum6)} />
          <Mini label="L/h" value={r.sweatRateLh === null ? "—" : fmt(r.sweatRateLh, 2)} />
          <Mini label="Adher." value={r.adherence7 === null ? "—" : `${r.adherence7} %`} />
        </dl>
      </div>
    </Link>
  );
}

/**
 * Cobertura del grupo (KAN-34): cuánto del plantel tiene plan, medición reciente y
 * registro de comidas. Una línea debajo de los KPIs, sin competirles.
 */
function Coverage({ c, today }: { c: GroupBoardDto["coverage"]; today: string }) {
  const since = c.lastMeasuredOn ? daysSince(c.lastMeasuredOn, today) : null;
  const items: [string, React.ReactNode][] = [
    ["Con plan vigente", <>{c.withPlan}<Of n={c.members} /></>],
    ["Medidos en 30 días", <>{c.measured30}<Of n={c.members} /></>],
    [
      "Última antropometría",
      since === null ? "—" : since === 0 ? "Hoy" : <>{since} <span className="text-base font-semibold text-stone-500">{since === 1 ? "día" : "días"}</span></>,
    ],
    [
      "Adherencia 30 días",
      c.adherence30 === null ? "—" : <>{c.adherence30}<span className="text-base font-semibold text-stone-500"> % · {c.logging30} registran</span></>,
    ],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-stone-200 px-5 py-4 lg:grid-cols-4" aria-label="Cobertura del grupo">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="font-display text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</dt>
          <dd className="font-display text-2xl font-bold tabular-nums text-stone-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Of({ n }: { n: number }) {
  return <span className="text-base font-semibold text-stone-500"> / {n}</span>;
}

function daysSince(date: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

function Kpi({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("-ml-px -mt-px border-l border-t border-stone-200 px-5 py-4", className)}>
      <div className="font-display text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</div>
      <div className="font-display text-5xl font-bold leading-none tabular-nums text-stone-900">{children}</div>
    </div>
  );
}

function Small({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("text-xl font-semibold", className ?? "text-stone-500")}>{children}</span>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-display text-[11px] font-semibold uppercase tracking-wider text-stone-500">{label}</dt>
      <dd className="font-display text-lg font-semibold tabular-nums text-stone-800">{value}</dd>
    </div>
  );
}
