"use client";

import { useRef, type KeyboardEvent } from "react";

import { cn } from "./cn";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Contador opcional al lado del label (ej. cantidad de notas). */
  count?: number;
  /** Marca de atención (ej. una crisis sin revisar). */
  alert?: boolean;
}

/**
 * Pestañas accesibles (patrón WAI-ARIA tabs): role tablist/tab, `aria-selected`,
 * foco itinerante (sólo la activa entra en el Tab order) y ←/→/Inicio/Fin para
 * moverse. El panel lo renderiza el caller con `tabPanelProps(id)`. En mobile la
 * barra scrollea horizontal en vez de partirse en varias líneas.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Nombre accesible de la barra. */
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent, index: number) {
    const last = items.length - 1;
    const next =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    onChange(items[next]!.id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-stone-200 px-4 sm:mx-0 sm:px-0"
    >
      {items.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative -mb-px flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              active
                ? "border-brand font-medium text-brand"
                : "border-transparent text-stone-600 hover:border-stone-300 hover:text-stone-900",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="rounded-full bg-stone-100 px-1.5 text-xs tabular-nums text-stone-600">
                {t.count}
              </span>
            )}
            {t.alert && (
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="requiere atención" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Props del panel asociado a una pestaña. */
export function tabPanelProps(id: string) {
  return {
    role: "tabpanel" as const,
    id: `panel-${id}`,
    "aria-labelledby": `tab-${id}`,
    tabIndex: 0,
  };
}
