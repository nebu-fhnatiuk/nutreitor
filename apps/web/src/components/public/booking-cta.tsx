"use client";

import { useState } from "react";

/**
 * CTA "Agendar una cita". En este sprint captura intención con un placeholder
 * (no construye el motor de agendamiento). Es el punto de enganche del Sprint 3.
 */
export function BookingCta({ professionalName }: { professionalName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-stone-900">¿Querés empezar?</h3>
      <p className="mt-1 text-sm text-stone-600">
        Agendá una primera consulta con {professionalName}.
      </p>
      {open ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-brand/10 px-4 py-3 text-sm text-stone-700">
          <CalendarIcon />
          <span>
            El agendamiento online estará disponible muy pronto. Guardá esta página
            para reservar tu turno apenas se habilite.
          </span>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition hover:brightness-110 sm:w-auto"
        >
          <CalendarIcon />
          Agendar una cita
        </button>
      )}
    </div>
  );
}

/** Ícono calendario (Lucide), 24×24, hereda color/altura del contexto. */
function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
    </svg>
  );
}
