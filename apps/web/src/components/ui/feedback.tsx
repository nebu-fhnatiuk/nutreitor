import { AlertCircle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

export type AlertTone = "error" | "info";

const ALERT_TONES: Record<AlertTone, string> = {
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-stone-200 bg-stone-50 text-stone-600",
};

/**
 * Mensaje de estado (error/info). Antes la caja roja se reimplementaba en ~13
 * pantallas con márgenes dispares. Token único; el margen lo pone el contenedor.
 */
export function Alert({
  children,
  tone = "error",
  className,
}: {
  children: ReactNode;
  tone?: AlertTone;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-4 py-2.5 text-sm",
        ALERT_TONES[tone],
        className,
      )}
    >
      {tone === "error" && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <span>{children}</span>
    </div>
  );
}

/** Spinner de marca (respeta prefers-reduced-motion vía globals). */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden />;
}

/** Estado de carga inline, consistente (antes: "Cargando…" suelto en ~7 lugares). */
export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-stone-500">
      <Spinner />
      {label}
    </p>
  );
}

/** Estado vacío consistente: texto guía + acción opcional. */
export function EmptyState({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-2 text-sm text-stone-500">
      <p>{children}</p>
      {action}
    </div>
  );
}
