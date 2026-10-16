"use client";

import { useCallback, useEffect, useState } from "react";
import type { SlotDto } from "@nutreitor/shared";

import { Alert, EmptyState, Loading, SectionHeading } from "@/components/ui";
import { api } from "@/lib/api";
import { browserTimezone, fmtDayLong, fmtTime, groupByDay } from "@/lib/datetime";

/**
 * Elige un horario libre. Trae los slots de `path` (que ya vienen en UTC) y los
 * muestra agrupados por día en el huso del navegador. Al elegir, llama `onPick`.
 */
export function SlotPicker({
  path,
  onPick,
  reloadKey,
}: {
  path: string;
  onPick: (startsAt: string) => Promise<void> | void;
  reloadKey?: number;
}) {
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSlots(await api<SlotDto[]>(path));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function pick(startsAt: string) {
    setPicking(startsAt);
    setError(null);
    try {
      await onPick(startsAt);
    } catch (e) {
      setError(String(e));
    } finally {
      setPicking(null);
    }
  }

  if (loading) return <Loading label="Buscando horarios…" />;
  if (error) return <Alert>{error}</Alert>;
  if (slots.length === 0) return <EmptyState>No hay horarios disponibles por ahora.</EmptyState>;

  return (
    <div>
      <p className="mb-3 text-xs text-stone-400">Horarios en tu zona ({browserTimezone()}).</p>
      <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
        {groupByDay(slots).map(([k, daySlots]) => (
          <div key={k}>
            <SectionHeading className="mb-1.5">{fmtDayLong(daySlots[0]!.startsAt)}</SectionHeading>
            <div className="flex flex-wrap gap-1.5">
              {daySlots.map((s) => (
                <button
                  key={s.startsAt}
                  type="button"
                  disabled={picking !== null}
                  onClick={() => pick(s.startsAt)}
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-700 transition hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  {fmtTime(s.startsAt)}
                  {picking === s.startsAt ? "…" : ""}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
