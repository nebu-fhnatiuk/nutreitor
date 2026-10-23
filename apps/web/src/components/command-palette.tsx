"use client";

import { ArrowRight, FileText, Layers, Search, UserRound, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildCommands, searchCommands, type CommandItem, type GroupDto, type PatientDto } from "@nutreitor/shared";

import { cn } from "@/components/ui";
import { api } from "@/lib/api";

const ICON = { nav: ArrowRight, patient: UserRound, group: Layers, action: Zap } as const;

/** ⌘K en Mac, Ctrl+K en el resto. */
function useIsMac() {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return mac;
}

/**
 * Paleta de comandos (KAN-75): Ctrl+K / ⌘K abre un buscador de deportistas, planteles
 * y acciones ("medir a Juan", "plan de Sofía", "plantel Sub-17"). Los datos son los
 * de `GET /patients` y `GET /groups`, que la API ya filtra (el profesional sólo ve a
 * sus asignados); se piden la primera vez que se abre. Patrón WAI-ARIA combobox:
 * ↑/↓ eligen, Enter va, Escape cierra.
 */
export function CommandPalette({
  nav,
  patientsPath,
  groupsPath,
  canMessage,
}: {
  nav: { href: string; label: string }[];
  patientsPath: string;
  groupsPath: string;
  canMessage: boolean;
}) {
  const router = useRouter();
  const mac = useIsMac();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [data, setData] = useState<{ patients: PatientDto[]; groups: GroupDto[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Al abrir: búsqueda vacía y foco en el campo.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  // La primera vez que se abre, los deportistas y planteles visibles.
  useEffect(() => {
    if (!open || data) return;
    void Promise.all([
      api<PatientDto[]>("patients").catch(() => [] as PatientDto[]),
      api<GroupDto[]>("groups").catch(() => [] as GroupDto[]),
    ]).then(([patients, groups]) => setData({ patients, groups }));
  }, [open, data]);

  const items = useMemo(
    () =>
      buildCommands({
        patients: data?.patients ?? [],
        groups: data?.groups ?? [],
        patientsPath,
        groupsPath,
        canMessage,
        nav,
      }),
    [data, patientsPath, groupsPath, canMessage, nav],
  );
  const results = useMemo(() => searchCommands(items, q), [items, q]);
  useEffect(() => setActive(0), [q]);

  const go = useCallback(
    (item: CommandItem | undefined) => {
      if (!item) return;
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
    else if (e.key === "Enter") go(results[active]);
    else if (e.key === "Escape") setOpen(false);
    else return;
    e.preventDefault();
  }

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
      className="flex min-h-10 items-center gap-2 rounded-full border border-stone-200 px-3 text-sm text-stone-500 transition hover:border-stone-300 hover:text-stone-800"
    >
      <Search className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Buscar deportista o acción</span>
      <span className="sr-only sm:hidden">Buscar</span>
      <kbd className="ml-1 hidden rounded border border-stone-200 px-1.5 font-display text-xs font-semibold text-stone-500 sm:inline">
        {mac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );

  if (!open || typeof document === "undefined") return trigger;
  const root = document.querySelector<HTMLElement>("[data-theme]") ?? document.body;

  return (
    <>
      {trigger}
      {createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]">
          <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default" />
          <div role="dialog" aria-modal="true" aria-label="Buscar" className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-stone-200 bg-surface shadow-2xl">
            <div className="flex items-center gap-3 border-b border-stone-200 px-4">
              <Search className="h-5 w-5 shrink-0 text-stone-500" aria-hidden />
              <input
                ref={input}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
                aria-autocomplete="list"
                aria-label="Buscar deportista, plantel o acción"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="medir a Juan, plan de Sofía, plantel Sub-17…"
                className="min-h-14 w-full bg-transparent text-base text-stone-900 outline-none placeholder:text-stone-400"
              />
              <kbd className="hidden rounded border border-stone-200 px-1.5 font-display text-xs font-semibold text-stone-500 sm:inline">Esc</kbd>
            </div>
            <ul id={listId} role="listbox" aria-label="Resultados" className="max-h-[50vh] overflow-y-auto p-2">
              {!data && <li className="px-3 py-6 text-center text-sm text-stone-500">Cargando…</li>}
              {data && results.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-stone-500">Nada con “{q}”. Probá con un nombre o un verbo: medir, plan, sudor…</li>
              )}
              {results.map((r, i) => {
                const Icon = r.kind === "patient" && q ? FileText : ICON[r.kind];
                return (
                  <li
                    key={r.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(r);
                    }}
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3",
                      i === active ? "bg-brand/15 text-stone-900" : "text-stone-700",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", i === active ? "text-brand" : "text-stone-400")} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    {r.subtitle && <span className="hidden truncate text-xs text-stone-500 sm:block">{r.subtitle}</span>}
                    {i === active && <kbd className="hidden font-display text-xs font-semibold text-stone-500 sm:inline">Enter</kbd>}
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-stone-200 px-4 py-2 text-xs text-stone-500">↑ ↓ para elegir · Enter para ir · Esc para cerrar</p>
          </div>
        </div>,
        root,
      )}
    </>
  );
}
