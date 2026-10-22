"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adherenceStatusLabels,
  adherenceStatuses,
  type AdherenceDto,
  type AdherenceStatus,
  type CheckinRecordDto,
  type NotificationPreferencesDto,
} from "@nutreitor/shared";

import { cn, Toggle, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/**
 * Adherencia del día en el portal (Fase 4.3): estado por comida + sensación del día.
 * Guarda al tocar (optimista); si falla, vuelve atrás y avisa.
 */
export function useDayAdherence(date: string) {
  const [logs, setLogs] = useState<Record<string, AdherenceStatus>>({});
  const [checkin, setCheckin] = useState<CheckinRecordDto | null>(null);
  const { toast } = useFeedback();

  useEffect(() => {
    let alive = true;
    setLogs({});
    setCheckin(null);
    api<AdherenceDto>(`portal/me/adherence?from=${date}&to=${date}`)
      .then((a) => {
        if (!alive) return;
        // Lo que se tocó mientras cargaba gana sobre lo leído (no pisar el toque).
        setLogs((local) => ({ ...Object.fromEntries(a.logs.map((l) => [l.mealName, l.status])), ...local }));
        setCheckin((local) => local ?? a.checkins[0] ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [date]);

  const setStatus = useCallback(
    async (mealName: string, status: AdherenceStatus) => {
      const prev = logs[mealName];
      setLogs((l) => ({ ...l, [mealName]: status }));
      try {
        await api("portal/me/adherence/meals", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, mealName, status }),
        });
      } catch (e) {
        setLogs((l) => {
          const next = { ...l };
          if (prev) next[mealName] = prev;
          else delete next[mealName];
          return next;
        });
        toast(errorMessage(e), "error");
      }
    },
    [date, logs, toast],
  );

  const saveCheckin = useCallback(
    async (patch: Partial<Omit<CheckinRecordDto, "date">>) => {
      const prev = checkin;
      const next = { hunger: null, energy: null, mood: null, note: null, ...checkin, ...patch, date };
      setCheckin(next);
      try {
        await api("portal/me/adherence/checkin", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
      } catch (e) {
        setCheckin(prev);
        toast(errorMessage(e), "error");
      }
    },
    [checkin, date, toast],
  );

  return { logs, checkin, setStatus, saveCheckin };
}

const statusStyles: Record<AdherenceStatus, string> = {
  done: "border-emerald-600 bg-emerald-600 text-white",
  partial: "border-amber-500 bg-amber-500 text-white",
  skipped: "border-stone-500 bg-stone-500 text-white",
};

/** Un toque por comida: Cumplí / En parte / No. */
export function MealCheck({
  mealName,
  status,
  onChange,
}: {
  mealName: string;
  status: AdherenceStatus | undefined;
  onChange: (s: AdherenceStatus) => void;
}) {
  return (
    <div role="group" aria-label={`¿Cómo te fue con ${mealName}?`} className="mt-2 flex gap-1.5">
      {adherenceStatuses.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={status === s}
          onClick={() => onChange(s)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition",
            status === s ? statusStyles[s] : "border-stone-200 text-stone-600 hover:border-brand/40 hover:text-brand",
          )}
        >
          {adherenceStatusLabels[s]}
        </button>
      ))}
    </div>
  );
}

const SCALES = [
  { key: "hunger", label: "Hambre", low: "poca", high: "mucha" },
  { key: "energy", label: "Energía", low: "baja", high: "alta" },
  { key: "mood", label: "Ánimo", low: "bajo", high: "muy bien" },
] as const;

/** Cómo se sintió en el día: tres escalas 1–5 y una nota. */
export function DayCheckin({
  checkin,
  onSave,
}: {
  checkin: CheckinRecordDto | null;
  onSave: (patch: Partial<Omit<CheckinRecordDto, "date">>) => void;
}) {
  const [note, setNote] = useState(checkin?.note ?? "");
  useEffect(() => setNote(checkin?.note ?? ""), [checkin?.note]);
  return (
    <div className="mt-5 border-t border-stone-100 pt-4">
      <p className="text-sm font-medium text-stone-900">¿Cómo te sentiste?</p>
      {/* En pantallas angostas las puntas de la escala no entran al costado. */}
      <p className="mb-3 text-xs text-stone-500 sm:hidden">1 = poco · 5 = mucho</p>
      <div className="mb-3 hidden sm:block" />
      <div className="space-y-2.5">
        {SCALES.map((sc) => (
          <div key={sc.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-16 text-sm text-stone-600">{sc.label}</span>
            <div role="group" aria-label={sc.label} className="flex items-center gap-1">
              <span className="mr-1 hidden text-xs text-stone-400 sm:inline">{sc.low}</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={checkin?.[sc.key] === n}
                  aria-label={`${sc.label} ${n} de 5`}
                  onClick={() => onSave({ [sc.key]: n })}
                  className={cn(
                    "h-8 w-8 rounded-full border text-sm transition",
                    checkin?.[sc.key] === n
                      ? "border-brand bg-brand text-brand-fg"
                      : "border-stone-200 text-stone-600 hover:border-brand/40",
                  )}
                >
                  {n}
                </button>
              ))}
              <span className="ml-1 hidden text-xs text-stone-400 sm:inline">{sc.high}</span>
            </div>
          </div>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if (note.trim() !== (checkin?.note ?? "")) onSave({ note: note.trim() || null });
        }}
        maxLength={500}
        placeholder="Algo que quieras contarle a tu profesional (opcional)"
        className="mt-3 w-full rounded-lg border border-stone-200 bg-surface px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </div>
  );
}

/**
 * Recordatorio diario (opt-in): a la hora elegida, si no marcó ninguna comida del
 * día, le llega un email. Toma la zona horaria del dispositivo.
 */
export function DailyReminder() {
  const [prefs, setPrefs] = useState<NotificationPreferencesDto | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();

  useEffect(() => {
    api<NotificationPreferencesDto>("portal/me/notification-preferences")
      .then(setPrefs)
      .catch(() => {});
  }, []);
  if (!prefs) return null;

  async function save(patch: Partial<NotificationPreferencesDto>) {
    const next = {
      ...prefs!,
      ...patch,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || prefs!.timezone,
    };
    setBusy(true);
    try {
      setPrefs(
        await api<NotificationPreferencesDto>("portal/me/notification-preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        }),
      );
      if (patch.adherenceReminder !== undefined) {
        toast(patch.adherenceReminder ? "Listo: te vamos a recordar registrar" : "Recordatorio desactivado");
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-stone-100 pt-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-stone-900">Recordatorio diario por email</span>
        <Toggle
          on={prefs.adherenceReminder}
          busy={busy}
          label="Recordatorio diario para registrar mis comidas"
          onChange={() => void save({ adherenceReminder: !prefs.adherenceReminder })}
        />
      </div>
      <label className="mt-1 flex flex-wrap items-center gap-2 text-stone-600">
        Si no registré nada, avisarme a las
        <select
          value={prefs.adherenceReminderHour}
          disabled={busy || !prefs.adherenceReminder}
          onChange={(e) => void save({ adherenceReminderHour: Number(e.target.value) })}
          aria-label="Hora del recordatorio"
          className="rounded-lg border border-stone-200 bg-surface px-2 py-1 text-sm disabled:opacity-50"
        >
          {[18, 19, 20, 21, 22, 23].map((h) => (
            <option key={h} value={h}>
              {h}:00
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
