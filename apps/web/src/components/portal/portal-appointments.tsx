"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppointmentDto } from "@nutreitor/shared";

import { Alert, Button, Card, Loading, Modal, SectionHeading, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { AppointmentsList } from "@/components/scheduling/appointments-list";
import { SlotPicker } from "@/components/scheduling/slot-picker";
import { fmtDateTime } from "@/lib/datetime";

/** Turnos del paciente: próximos + reservar (slots de su profesional) + cancelar. */
export function PortalAppointments() {
  const [appts, setAppts] = useState<AppointmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [rescheduling, setRescheduling] = useState<AppointmentDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAppts(await api<AppointmentDto[]>("portal/appointments"));
    } catch (e) {
      setError(errorMessage(e));
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

  const { confirm, toast } = useFeedback();

  async function cancel(id: string) {
    const ok = await confirm({
      title: "¿Cancelar tu turno?",
      body: "Si querés otro horario, podés reprogramarlo en lugar de cancelarlo.",
      confirmLabel: "Cancelar turno",
      cancelLabel: "Mantener",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    try {
      await api(`portal/appointments/${id}/cancel`, { method: "POST" });
      toast("Turno cancelado");
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // Reprograma con el MISMO profesional (los slots salen de `portal/slots`); un solo paso.
  async function doReschedule(startsAt: string) {
    if (!rescheduling) return;
    setError(null);
    try {
      await api(`portal/appointments/${rescheduling.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startsAt }),
      });
      setRescheduling(null);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // Sólo a futuro y reservados (lo pasado/cancelado no es accionable para el paciente).
  const upcoming = appts.filter(
    (a) => a.status === "booked" && new Date(a.endsAt).getTime() >= Date.now(),
  );

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <SectionHeading>Tus turnos</SectionHeading>
        {!booking && (
          <Button size="sm" onClick={() => setBooking(true)}>
            Reservar turno
          </Button>
        )}
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}

      {booking ? (
        <div>
          <SlotPicker path="portal/slots" onPick={book} />
          <Button variant="ghost" onClick={() => setBooking(false)} className="mt-4">
            Cancelar
          </Button>
        </div>
      ) : loading ? (
        <Loading />
      ) : (
        <AppointmentsList
          items={upcoming}
          perspective="patient"
          onCancel={cancel}
          onReschedule={setRescheduling}
        />
      )}

      <Modal
        open={rescheduling !== null}
        onClose={() => setRescheduling(null)}
        title="Reprogramar turno"
      >
        {rescheduling && (
          <>
            <p className="mb-3 text-sm text-stone-500">
              Con {rescheduling.professionalName} · actual: {fmtDateTime(rescheduling.startsAt)}
            </p>
            <SlotPicker path="portal/slots" onPick={doReschedule} />
          </>
        )}
      </Modal>
    </Card>
  );
}
