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
        <p className="mt-4 rounded-xl bg-brand/10 px-4 py-3 text-sm text-stone-700">
          🗓️ El agendamiento online llega muy pronto. Mientras tanto, anotamos tu
          interés — te vamos a contactar para coordinar.
        </p>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition hover:brightness-110 sm:w-auto"
        >
          Agendar una cita
        </button>
      )}
    </div>
  );
}
