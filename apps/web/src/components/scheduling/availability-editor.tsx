"use client";

import { useCallback, useEffect, useState } from "react";
import type { AvailabilityDto, AvailabilityWindow } from "@nutreitor/shared";

import { api } from "@/lib/api";
import { browserTimezone } from "@/lib/datetime";

const WEEKDAYS: [number, string][] = [
  [1, "Lunes"],
  [2, "Martes"],
  [3, "Miércoles"],
  [4, "Jueves"],
  [5, "Viernes"],
  [6, "Sábado"],
  [7, "Domingo"],
];
const SLOT_OPTIONS = [15, 20, 30, 45, 60, 90];

const inputCls =
  "rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

const toHM = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const toMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const emptyWindow = (): AvailabilityWindow => ({
  weekday: 1,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  slotMinutes: 30,
});

/** Edita la disponibilidad semanal del profesional (huso + ventanas). */
export function AvailabilityEditor() {
  const [timezone, setTimezone] = useState("");
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const a = await api<AvailabilityDto>("scheduling/availability");
      setTimezone(a.timezone ?? browserTimezone());
      setWindows(a.windows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update(i: number, patch: Partial<AvailabilityWindow>) {
    setWindows((ws) => ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api("scheduling/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: timezone.trim() || browserTimezone(), windows }),
      });
      setSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-stone-400">Cargando…</p>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <label className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-stone-500">Zona horaria</span>
        <input
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className={`${inputCls} w-72`}
          placeholder="America/Argentina/Buenos_Aires"
        />
      </label>

      <div className="space-y-2">
        {windows.length === 0 && (
          <p className="text-sm text-stone-400">Todavía no cargaste horarios de atención.</p>
        )}
        {windows.map((w, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 p-2.5">
            <select
              value={w.weekday}
              onChange={(e) => update(i, { weekday: Number(e.target.value) })}
              className={inputCls}
            >
              {WEEKDAYS.map(([n, label]) => (
                <option key={n} value={n}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={toHM(w.startMinute)}
              onChange={(e) => update(i, { startMinute: toMin(e.target.value) })}
              className={inputCls}
            />
            <span className="text-stone-400">a</span>
            <input
              type="time"
              value={toHM(w.endMinute)}
              onChange={(e) => update(i, { endMinute: toMin(e.target.value) })}
              className={inputCls}
            />
            <select
              value={w.slotMinutes}
              onChange={(e) => update(i, { slotMinutes: Number(e.target.value) })}
              className={inputCls}
            >
              {SLOT_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  turnos de {m}′
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setWindows((ws) => ws.filter((_, j) => j !== i))}
              className="ml-auto rounded-lg px-2 text-sm text-stone-400 transition hover:text-red-600"
              aria-label="Quitar franja"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setWindows((ws) => [...ws, emptyWindow()])}
          className="rounded-lg border border-dashed border-stone-300 px-4 py-2 text-sm text-stone-500 transition hover:border-brand/50 hover:text-stone-700"
        >
          + Agregar franja horaria
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Guardar disponibilidad"}
        </button>
        {saved && <span className="text-sm text-brand">Guardado ✓</span>}
      </div>
    </div>
  );
}
