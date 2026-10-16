"use client";

import { useEffect, useRef, useState } from "react";
import type { FoodDto } from "@nutreitor/shared";

import { cn } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * Campo "Alimento" con búsqueda en la base (ADR 0018). Se escribe libre como antes
 * (texto del item); desde 2 letras sugiere alimentos del catálogo y propios del
 * consultorio. Elegir uno vincula el item (el editor calcula los macros). Teclado:
 * ↑/↓ para moverse, Enter para elegir, Escape para cerrar.
 */
export function FoodPicker({
  value,
  onText,
  onPick,
  className,
}: {
  value: string;
  onText: (text: string) => void;
  onPick: (food: FoodDto) => void;
  className?: string;
}) {
  const [hits, setHits] = useState<FoodDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Sólo se busca lo que el usuario TIPEA (no al montar ni al elegir).
  const [query, setQuery] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query?.trim() ?? "";
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    timer.current = setTimeout(async () => {
      try {
        const res = await api<FoodDto[]>(`foods?q=${encodeURIComponent(q)}&limit=8`);
        if (!cancelled) {
          setHits(res);
          setActive(0);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setHits([]); // sin base no se rompe el editor: queda texto libre
      }
    }, 250);
    return () => {
      cancelled = true;
    };
  }, [query]);

  function pick(food: FoodDto) {
    setOpen(false);
    setQuery(null);
    onPick(food);
  }

  return (
    <div className="relative flex-1">
      <input
        value={value}
        onChange={(e) => {
          onText(e.target.value);
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!open || hits.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(hits[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Alimento / preparación"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-autocomplete="list"
        className={className}
      />
      {open && hits.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {hits.map((f, i) => (
            <li
              key={`${f.source}:${f.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(f);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm",
                i === active ? "bg-brand/10" : "",
              )}
            >
              <span className="text-stone-800">
                {f.name}
                {f.source === "tenant" && (
                  <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 text-[10px] uppercase tracking-wide text-stone-500">
                    propio
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-stone-400">
                {Math.round(f.per100g.energyKcal)} kcal/100 g
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
