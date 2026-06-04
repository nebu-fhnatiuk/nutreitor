"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppointmentDto } from "@nutreitor/shared";

import { api } from "@/lib/api";
import { AppointmentsList } from "@/components/scheduling/appointments-list";
import { SlotPicker } from "@/components/scheduling/slot-picker";

const card = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm";
const h2 = "text-xs font-semibold uppercase tracking-widest text-stone-400";

/** Turnos del paciente: próximos + reservar (slots de su profesional) + cancelar. */
export function PortalAppointments() {
  const [appts, setAppts] = useState<AppointmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAppts(await api<AppointmentDto[]>("portal/appointments"));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function book(startsAt: string) {
    await api("portal/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startsAt }),
    });
    setBooking(false);
    void load();
  }

  async function cancel(id: string) {
    setError(null);
    try {
      await api(`portal/appointments/${id}/cancel`, { method: "POST" });
      void load();
    } catch (e) {
      setError(String(e));
    }
  }

  // Sólo a futuro y reservados (lo pasado/cancelado no es accionable para el paciente).
  const upcoming = appts.filter(
    (a) => a.status === "booked" && new Date(a.endsAt).getTime() >= Date.now(),
  );

  return (
    <section className={card}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className={h2}>Tus turnos</h2>
        {!booking && (
          <button
            type="button"
            onClick={() => setBooking(true)}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-brand-fg transition hover:brightness-110"
          >
            Reservar turno
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {booking ? (
        <div>
          <SlotPicker path="portal/slots" onPick={book} />
          <button
            type="button"
            onClick={() => setBooking(false)}
            className="mt-4 rounded-lg px-4 py-2 text-sm text-stone-500 transition hover:bg-stone-100"
          >
            Cancelar
          </button>
        </div>
      ) : loading ? (
        <p className="text-sm text-stone-400">Cargando…</p>
      ) : (
        <AppointmentsList items={upcoming} perspective="patient" onCancel={cancel} />
      )}
    </section>
  );
}
