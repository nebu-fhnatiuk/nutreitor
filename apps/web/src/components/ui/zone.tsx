import type { ReactNode } from "react";

import { cn } from "./cn";

/** Dentro del rango, en el límite, fuera. */
export type Zone = "ok" | "warn" | "bad";

export const ZONE_LABEL: Record<Zone, string> = {
  ok: "En rango",
  warn: "En el límite",
  bad: "Fuera de rango",
};

/** Texto en el color de la zona (cifras, rótulos). */
export const zoneText: Record<Zone, string> = {
  ok: "text-zone-ok",
  warn: "text-zone-warn",
  bad: "text-zone-bad",
};

/** Relleno sólido (barras, franjas de tarjeta, puntos). */
export const zoneFill: Record<Zone, string> = {
  ok: "bg-zone-ok",
  warn: "bg-zone-warn",
  bad: "bg-zone-bad",
};

/** Fondo tenue para chips y celdas. */
export const zoneSoft: Record<Zone, string> = {
  ok: "bg-zone-ok/10",
  warn: "bg-zone-warn/10",
  bad: "bg-zone-bad/10",
};

/**
 * Forma de la zona: el estado nunca depende sólo del color (daltonismo, impresión
 * en blanco y negro). Rombo = en rango, cuadrado = en el límite, círculo = fuera.
 */
export function ZoneMark({ zone, className }: { zone: Zone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0",
        zoneFill[zone],
        zone === "ok" && "rotate-45 rounded-[1px]",
        zone === "warn" && "rounded-[2px]",
        zone === "bad" && "rounded-full",
        className,
      )}
    />
  );
}

/** Chip de zona: forma + texto (por defecto el rótulo estándar de la zona). */
export function ZoneBadge({
  zone,
  children,
  className,
}: {
  zone: Zone;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        "font-display text-xs font-semibold uppercase tracking-wider",
        zoneText[zone],
        zoneSoft[zone],
        className,
      )}
    >
      <ZoneMark zone={zone} />
      {children ?? ZONE_LABEL[zone]}
    </span>
  );
}

/**
 * Cifra de marcador: condensada, tabular, grande. La unidad va más chica al lado.
 * Si se pasa `zone`, la cifra toma el color de la zona.
 */
export function Stat({
  label,
  value,
  unit,
  zone,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  zone?: Zone;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="font-display text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</div>
      <div
        className={cn(
          "font-display text-4xl font-bold leading-none tabular-nums",
          zone ? zoneText[zone] : "text-stone-900",
        )}
      >
        {value}
        {unit && <span className="ml-1 text-base font-semibold text-stone-500">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-stone-500">{hint}</div>}
    </div>
  );
}
