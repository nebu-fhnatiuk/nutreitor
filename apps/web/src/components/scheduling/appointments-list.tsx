"use client";

import type { AppointmentDto, AppointmentStatus } from "@nutreitor/shared";

import { EmptyState, SectionHeading } from "@/components/ui";
import { fmtDayLong, fmtTime, groupByDay } from "@/lib/datetime";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: "reservado",
  cancelled: "cancelado",
  completed: "completado",
  no_show: "no asistió",
};

/**
 * Lista de citas agrupadas por día (en el huso del navegador). Según la
 * perspectiva muestra el nombre del paciente (pro) o del profesional (paciente).
 * Las acciones (cancelar/reprogramar) sólo aparecen en citas reservadas.
 */
export function AppointmentsList({
  items,
  perspective,
  onCancel,
  onReschedule,
}: {
  items: AppointmentDto[];
  perspective: "professional" | "patient";
  onCancel?: (id: string) => void;
  onReschedule?: (appt: AppointmentDto) => void;
}) {
  if (items.length === 0) {
    return <EmptyState>No hay turnos.</EmptyState>;
  }
  return (
    <div className="space-y-4">
      {groupByDay(items).map(([k, day]) => (
        <div key={k}>
          <SectionHeading className="mb-1.5">{fmtDayLong(day[0]!.startsAt)}</SectionHeading>
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-100">
            {day.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm font-medium text-stone-800">
                    {fmtTime(a.startsAt)}–{fmtTime(a.endsAt)}
                  </span>
                  <span className="text-sm text-stone-600">
                    {perspective === "professional" ? a.patientName : a.professionalName}
                  </span>
                  <StatusChip status={a.status} />
                </div>
                {a.status === "booked" && (onReschedule || onCancel) && (
                  <div className="flex gap-1">
                    {onReschedule && (
                      <button
                        type="button"
                        onClick={() => onReschedule(a)}
                        className="min-h-11 rounded-lg px-3 text-sm sm:min-h-0 sm:px-2.5 sm:py-1 sm:text-xs text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
                      >
                        Reprogramar
                      </button>
                    )}
                    {onCancel && (
                      <button
                        type="button"
                        onClick={() => onCancel(a.id)}
                        className="min-h-11 rounded-lg px-3 text-sm sm:min-h-0 sm:px-2.5 sm:py-1 sm:text-xs text-red-600 transition hover:bg-red-50"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function StatusChip({ status }: { status: AppointmentStatus }) {
  const cls =
    status === "booked"
      ? "bg-brand/10 text-brand"
      : status === "completed"
        ? "bg-stone-100 text-stone-600"
        : "bg-stone-100 text-stone-500";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{STATUS_LABEL[status]}</span>
  );
}
