"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppointmentDto } from "@nutreitor/shared";

import { Alert, Card, Loading, Modal, SectionHeading } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/datetime";
import { AppointmentsList } from "./appointments-list";
import { AvailabilityEditor } from "./availability-editor";
import { SlotPicker } from "./slot-picker";

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

      {error && <Alert>{error}</Alert>}

      <Card>
        <SectionHeading className="mb-4">Disponibilidad semanal</SectionHeading>
        <AvailabilityEditor />
      </Card>

      <Card>
        <SectionHeading className="mb-4">Próximos turnos</SectionHeading>
        {loading ? (
          <Loading />
        ) : (
          <AppointmentsList
            items={booked}
            perspective="professional"
            onCancel={cancel}
            onReschedule={setRescheduling}
          />
        )}
      </Card>

      <Modal
        open={rescheduling !== null}
        onClose={() => setRescheduling(null)}
        title="Reprogramar turno"
      >
        {rescheduling && (
          <>
            <p className="mb-3 text-sm text-stone-500">
              {rescheduling.patientName} · actual: {fmtDateTime(rescheduling.startsAt)}
            </p>
            <SlotPicker path="scheduling/slots" onPick={doReschedule} />
          </>
        )}
      </Modal>
    </div>
  );
}
