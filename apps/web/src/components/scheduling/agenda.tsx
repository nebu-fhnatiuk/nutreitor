"use client";

import { CalendarClock, Clock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AppointmentDto, AvailabilityDto, AvailabilityWindow } from "@nutreitor/shared";

import {
  Alert,
  Button,
  Card,
  EmptyState,
  Loading,
  Modal,
  PageHeader,
  SectionHeading,
  SlideOver,
  useFeedback,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/datetime";
import { AppointmentsList } from "./appointments-list";
import { AvailabilityEditor } from "./availability-editor";
import { SlotPicker } from "./slot-picker";

const DAY_SHORT = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const hm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Resumen de una línea de los horarios: agrupa días con la misma franja y comprime
 * los consecutivos ("Lun–Vie 09:00–18:00 · turnos de 30′; Sáb 09:00–13:00 …").
 */
export function summarizeAvailability(windows: AvailabilityWindow[]): string[] {
  const groups = new Map<string, number[]>();
  for (const w of windows) {
    const k = `${w.startMinute}-${w.endMinute}-${w.slotMinutes}`;
    groups.set(k, [...(groups.get(k) ?? []), w.weekday]);
  }
  return [...groups.entries()].map(([k, days]) => {
    const [start, end, slot] = k.split("-").map(Number) as [number, number, number];
    const sorted = [...new Set(days)].sort((a, b) => a - b);
    const runs: string[] = [];
    for (let i = 0; i < sorted.length; ) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
      runs.push(j > i + 1 ? `${DAY_SHORT[sorted[i]!]}–${DAY_SHORT[sorted[j]!]}` : sorted.slice(i, j + 1).map((d) => DAY_SHORT[d]).join(", "));
      i = j + 1;
    }
    return `${runs.join(", ")} · ${hm(start)}–${hm(end)} · turnos de ${slot}′`;
  });
}

/**
 * Agenda del profesional: los TURNOS primero (es lo que se mira todos los días) y
 * los horarios de atención en un panel aparte (se configuran una vez). Antes el
 * editor de horarios ocupaba casi toda la pantalla y los turnos quedaban abajo.
 */
export function Agenda() {
  const [appts, setAppts] = useState<AppointmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<AppointmentDto | null>(null);
  const [availability, setAvailability] = useState<AvailabilityDto | null>(null);
  const [hoursOpen, setHoursOpen] = useState(false);

  const loadAvailability = useCallback(async () => {
    try {
      setAvailability(await api<AvailabilityDto>("scheduling/availability"));
    } catch {
      setAvailability({ timezone: null, windows: [] });
    }
  }, []);
  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Desde ahora en adelante (la agenda mira a futuro).
      setAppts(await api<AppointmentDto[]>(`scheduling/appointments?from=${new Date().toISOString()}`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { confirm, toast } = useFeedback();

  async function cancel(id: string) {
    const ok = await confirm({
      title: "¿Cancelar este turno?",
      body: "El horario vuelve a quedar libre para otra reserva.",
      confirmLabel: "Cancelar turno",
      cancelLabel: "Mantener",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    try {
      await api(`scheduling/appointments/${id}/cancel`, { method: "POST" });
      toast("Turno cancelado");
      void load();
    } catch (e) {
      setError(errorMessage(e));
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
      <PageHeader
        title="Agenda"
        description="Tus próximos turnos. Los horarios de atención se configuran aparte."
        className="mb-0"
        actions={
          <Button variant="secondary" onClick={() => setHoursOpen(true)}>
            <Clock className="h-4 w-4" aria-hidden />
            Horarios de atención
          </Button>
        }
      />

      {error && <Alert>{error}</Alert>}

      {availability && availability.windows.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-900">
            Todavía no cargaste tus horarios de atención: tus pacientes no pueden reservar turnos.
          </p>
          <Button size="sm" onClick={() => setHoursOpen(true)}>
            Cargar horarios
          </Button>
        </div>
      ) : (
        availability && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-600">
            <CalendarClock className="h-4 w-4 text-stone-500" aria-hidden />
            Atendés: {summarizeAvailability(availability.windows).join("; ")}
          </p>
        )
      )}

      <Card>
        <SectionHeading className="mb-4">Próximos turnos</SectionHeading>
        {loading ? (
          <Loading />
        ) : booked.length === 0 ? (
          <EmptyState>No tenés turnos reservados por delante.</EmptyState>
        ) : (
          <AppointmentsList
            items={booked}
            perspective="professional"
            onCancel={cancel}
            onReschedule={setRescheduling}
          />
        )}
      </Card>

      <SlideOver
        open={hoursOpen}
        onClose={() => setHoursOpen(false)}
        header={<h2 className="text-sm font-semibold text-stone-800">Horarios de atención</h2>}
        wide
      >
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-sm text-stone-600">
            Los días y horas en que atendés. De acá salen los turnos que pueden reservar tus
            pacientes y los visitantes de tu página.
          </p>
          <AvailabilityEditor onSaved={loadAvailability} />
        </div>
      </SlideOver>

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
