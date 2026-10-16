"use client";

import { useCallback, useEffect, useState } from "react";
import type { AvailabilityDto, AvailabilityWindow } from "@nutreitor/shared";

import { Alert, Button, EmptyState, Input, Loading, Select } from "@/components/ui";
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

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}

      <label className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-stone-500">Zona horaria</span>
        <Input
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-72"
          placeholder="America/Argentina/Buenos_Aires"
        />
      </label>

      <div className="space-y-2">
        {windows.length === 0 && (
          <EmptyState>Todavía no cargaste horarios de atención.</EmptyState>
        )}
        {windows.map((w, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 p-2.5">
            <Select
              value={w.weekday}
              onChange={(e) => update(i, { weekday: Number(e.target.value) })}
              className="w-auto"
            >
              {WEEKDAYS.map(([n, label]) => (
                <option key={n} value={n}>
                  {label}
                </option>
              ))}
            </Select>
            <Input
              type="time"
              value={toHM(w.startMinute)}
              onChange={(e) => update(i, { startMinute: toMin(e.target.value) })}
              className="w-auto"
            />
            <span className="text-stone-400">a</span>
            <Input
              type="time"
              value={toHM(w.endMinute)}
              onChange={(e) => update(i, { endMinute: toMin(e.target.value) })}
              className="w-auto"
            />
            <Select
              value={w.slotMinutes}
              onChange={(e) => update(i, { slotMinutes: Number(e.target.value) })}
              className="w-auto"
            >
              {SLOT_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  turnos de {m}′
                </option>
              ))}
            </Select>
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
        <Button onClick={save} disabled={busy}>
          {busy ? "Guardando…" : "Guardar disponibilidad"}
        </Button>
        {saved && <span className="text-sm text-brand">Guardado ✓</span>}
      </div>
    </div>
  );
}
