import type { TeamBoardDto, TeamBoardRowDto } from "@nutreitor/shared";

import { fmt } from "@/components/patients/anthro-format";
import { ZONE_LABEL, ZoneMark, cn, zoneFill, zoneSoft, zoneText, type Zone } from "@/components/ui";

/**
 * Tablero del cuerpo técnico (KAN-109). Misma lectura que la pizarra del plantel
 * (zona con forma y texto, el aviso más grave de titular), pero recortada: sin
 * plan, sin ficha, y Σ6 / masa muscular sólo de quien lo compartió.
 */
export function TeamBoard({ board }: { board: TeamBoardDto }) {
  const rows = board.rows;
  const c = board.coverage;
  const attention = rows.filter((r) => r.status.zone !== "ok").length;
  const worst: Zone | null = rows.some((r) => r.status.zone === "bad") ? "bad" : attention > 0 ? "warn" : null;

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-stone-200 bg-surface px-5 py-4 sm:grid-cols-4" aria-label="Resumen del plantel">
        <Stat label="Necesitan atención">
          <span className={worst ? zoneText[worst] : undefined}>{attention}</span>
          <Of n={rows.length} />
        </Stat>
        <Stat label="Registran comidas">
          {c.logging30}
          <Of n={c.members} />
        </Stat>
        <Stat label="Con plan">
          {c.withPlan}
          <Of n={c.members} />
        </Stat>
        <Stat label="Medidos en 30 días">
          {c.measured30}
          <Of n={c.members} />
        </Stat>
      </dl>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500" aria-label="Referencias">
        {(["bad", "warn", "ok"] as Zone[]).map((z) => (
          <li key={z} className="flex items-center gap-1.5">
            <ZoneMark zone={z} />
            {ZONE_LABEL[z]}
          </li>
        ))}
      </ul>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <li key={r.patientId} className="min-w-0">
            <PlayerCard row={r} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-stone-500">
        Pliegues (Σ6) y masa muscular aparecen sólo de los jugadores que aceptaron compartirlos. La ficha clínica, el plan y los
        mensajes quedan entre cada jugador y su nutricionista.
      </p>
    </div>
  );
}

function PlayerCard({ row: r }: { row: TeamBoardRowDto }) {
  const zone = r.status.zone;
  const [head, ...rest] = r.status.flags;
  return (
    <article className="flex h-full overflow-hidden rounded-2xl border border-stone-200 bg-surface">
      <span className={cn("w-1.5 shrink-0", zoneFill[zone])} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-bold uppercase leading-tight text-stone-900">{r.fullName}</p>
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
          {rest.length > 0 && <p className="mt-1 text-xs text-stone-500">{rest.map((f) => f.text).join(" · ")}</p>}
        </div>
        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-stone-200 pt-3">
          <Mini label="Adher." value={r.adherence7 === null ? "—" : `${r.adherence7} %`} hint={trend(r.adherence7, r.adherencePrev7)} />
          <Mini label="Energía" value={r.checkin?.energy == null ? "—" : `${r.checkin.energy}/5`} hint={r.checkin?.mood == null ? undefined : `ánimo ${r.checkin.mood}/5`} />
          <Mini label="Peso" value={r.bodyMass === null ? "—" : `${fmt(r.bodyMass)} kg`} hint={delta(r.bodyMassDelta, "kg")} />
          {r.body && (
            <>
              <Mini label="Σ6" value={r.body.sum6 === null ? "—" : `${fmt(r.body.sum6)} mm`} hint={delta(r.body.sum6Delta, "mm")} />
              <Mini label="Muscular" value={r.body.muscleKg === null ? "—" : `${fmt(r.body.muscleKg)} kg`} hint={delta(r.body.muscleKgDelta, "kg")} />
            </>
          )}
          <Mini label="Pérdida" value={r.lossPct === null ? "—" : `${fmt(r.lossPct)} %`} hint="entrenando" />
        </dl>
        <p className="text-xs text-stone-500">
          {r.hasPlan ? "Tiene plan" : "Sin plan"}
          {r.nextAppointmentAt && ` · Próximo control ${new Date(r.nextAppointmentAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`}
        </p>
      </div>
    </article>
  );
}

function trend(now: number | null, before: number | null): string | undefined {
  if (now === null || before === null) return undefined;
  const d = now - before;
  return d === 0 ? "igual" : `${d > 0 ? "▲" : "▼"} ${Math.abs(d)} pts`;
}

function delta(d: number | null, unit: string): string | undefined {
  if (d === null) return undefined;
  return d === 0 ? "igual" : `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))} ${unit}`;
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</dt>
      <dd className="font-display text-3xl font-bold tabular-nums text-stone-900">{children}</dd>
    </div>
  );
}

function Of({ n }: { n: number }) {
  return <span className="text-base font-semibold text-stone-500"> / {n}</span>;
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-display text-[11px] font-semibold uppercase tracking-wider text-stone-500">{label}</dt>
      <dd className="truncate font-display text-lg font-semibold tabular-nums text-stone-800">{value}</dd>
      {hint && <dd className="truncate text-xs text-stone-500">{hint}</dd>}
    </div>
  );
}
