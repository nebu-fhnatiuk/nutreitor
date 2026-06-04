"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppointmentDto } from "@nutreitor/shared";

import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/datetime";
import { AppointmentsList } from "./appointments-list";
import { AvailabilityEditor } from "./availability-editor";
import { SlotPicker } from "./slot-picker";

const card = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm";
const h2 = "mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400";

/** Agenda del profesional: disponibilidad + próximos turnos (cancelar/reprogramar). */
export function Agenda() {
  const [appts, setAppts] = useState<AppointmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<AppointmentDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Desde ahora en adelante (la agenda mira a futuro).
      setAppts(await api<AppointmentDto[]>(`scheduling/appointments?from=${new Date().toISOString()}`));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(id: string) {
    setError(null);
    try {
      await api(`scheduling/appointments/${id}/cancel`, { method: "POST" });
      void load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function doReschedule(startsAt: string) {
    if (!rescheduling) return;
    await api(`scheduling/appointments/${rescheduling.id}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startsAt }),
    });
    setRescheduling(null);
    void load();
  }

  const booked = appts.filter((a) => a.status === "booked");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-brand">Agenda</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-stone-900">
          Tu disponibilidad y tus turnos
        </h1>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className={card}>
        <h2 className={h2}>Disponibilidad semanal</h2>
        <AvailabilityEditor />
      </section>

      <section className={card}>
        <h2 className={h2}>Próximos turnos</h2>
        {loading ? (
          <p className="text-sm text-stone-400">Cargando…</p>
        ) : (
          <AppointmentsList
            items={booked}
            perspective="professional"
            onCancel={cancel}
            onReschedule={setRescheduling}
          />
        )}
      </section>

      {rescheduling && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/30 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-serif text-lg font-medium text-stone-900">Reprogramar turno</h3>
                <p className="text-sm text-stone-500">
                  {rescheduling.patientName} · actual: {fmtDateTime(rescheduling.startsAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRescheduling(null)}
                className="rounded-lg px-2 text-stone-400 transition hover:text-stone-700"
              >
                ✕
              </button>
            </div>
            <SlotPicker path="scheduling/slots" onPick={doReschedule} />
          </div>
        </div>
      )}
    </div>
  );
}
