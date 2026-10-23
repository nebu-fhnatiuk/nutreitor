import type { DayKind, Weekday } from "@nutreitor/shared";
import { weekdays } from "@nutreitor/shared";

import { cn } from "@/components/ui";

export interface StripDay {
  weekday: Weekday;
  /** Nombre del tipo de día ("Partido", "Pasada larga"…). */
  label?: string;
  kind?: DayKind;
  kcal?: number | null;
  choG?: number | null;
}

const SHORT: Record<Weekday, string> = { mon: "Lun", tue: "Mar", wed: "Mié", thu: "Jue", fri: "Vie", sat: "Sáb", sun: "Dom" };
export const KIND_LABEL: Record<DayKind, string> = { match: "Partido", training: "Entrenamiento", rest: "Descanso" };
/** En celular el nombre libre no entra: el tipo abreviado. */
const KIND_SHORT: Record<DayKind, string> = { match: "Partido", training: "Entreno", rest: "Libre" };
const KIND_BAR: Record<DayKind, string> = { match: "bg-accent2", training: "bg-brand", rest: "bg-stone-400" };
const KIND_TEXT: Record<DayKind, string> = { match: "text-accent2", training: "text-brand", rest: "text-stone-500" };

/** Lunes = 0 … domingo = 6 (JS arranca en domingo). */
export function todayWeekday(d = new Date()): Weekday {
  return weekdays[(d.getDay() + 6) % 7]!;
}

/**
 * Tira de la semana (KAN-73): los 7 días como un gráfico de carga. La altura de la
 * barra es la energía del día contra el día más alto; el color, el tipo de día
 * (partido = segundo color del club, entrenamiento = marca, descanso = neutro),
 * siempre con el nombre escrito. El mismo componente va en el requerimiento, el
 * editor del plan y el portal.
 */
export function WeekStrip({
  days,
  today,
  selected,
  onSelect,
  className,
}: {
  days: StripDay[];
  /** Resalta el día de hoy (portal). */
  today?: Weekday;
  /** Día elegido en el editor del plan. */
  selected?: Weekday;
  onSelect?: (d: Weekday) => void;
  className?: string;
}) {
  const byDay = new Map(days.map((d) => [d.weekday, d]));
  const max = Math.max(1, ...days.map((d) => d.kcal ?? 0));

  return (
    <ol className={cn("grid grid-cols-7 gap-0.5 sm:gap-2", className)} aria-label="Semana tipo">
      {weekdays.map((wd) => {
        const d = byDay.get(wd);
        const kind = d?.kind;
        const h = d?.kcal ? Math.max(12, Math.round((d.kcal / max) * 100)) : 0;
        const isToday = wd === today;
        const isSel = wd === selected;
        const body = (
          <>
            <span className={cn("font-display text-xs font-bold uppercase tracking-wider", isToday ? "text-stone-900" : "text-stone-500")}>
              {SHORT[wd]}
              {isToday && <span className="sr-only"> (hoy)</span>}
            </span>
            <span className="relative flex h-20 w-full items-end justify-center rounded-md bg-stone-100/60 sm:h-24" aria-hidden>
              {h > 0 && <span className={cn("w-full rounded-md", kind ? KIND_BAR[kind] : "bg-stone-300")} style={{ height: `${h}%` }} />}
            </span>
            <span className="font-display text-base font-bold leading-none tabular-nums text-stone-900 sm:text-lg">
              {d?.kcal ? d.kcal.toLocaleString("es-AR") : "—"}
            </span>
            <span className="text-[10px] tabular-nums text-stone-500 sm:text-xs">{d?.choG ? `CHO ${Math.round(d.choG)}\u00a0g` : " "}</span>
            <span className={cn("w-full truncate text-center font-display text-[10px] font-semibold uppercase sm:text-xs sm:tracking-wide", kind ? KIND_TEXT[kind] : "text-stone-400")}>
              <span className="sm:hidden">{kind ? KIND_SHORT[kind] : "—"}</span>
              <span className="hidden sm:inline">{d?.label ?? (kind ? KIND_LABEL[kind] : "Sin tipo")}</span>
            </span>
          </>
        );
        const cls = cn(
          "flex min-w-0 flex-col items-center gap-1 rounded-xl border px-0 py-2 sm:px-2",
          isToday ? "border-accent2 bg-accent2/10" : isSel ? "border-brand bg-brand/10" : "border-transparent",
        );
        return (
          <li key={wd}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(wd)}
                aria-pressed={isSel}
                className={cn(cls, "w-full transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40")}
              >
                {body}
              </button>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
