/**
 * CTA "Agendar una cita": ancla al widget de reserva real (más abajo en la página).
 * Era el placeholder del Sprint 2; con el agendamiento (Sprint 3) ahora enlaza al
 * formulario de reserva pública.
 */
export function BookingCta({ professionalName }: { professionalName: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-surface p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-stone-900">¿Querés empezar?</h3>
      <p className="mt-1 text-sm text-stone-600">
        Agendá una primera consulta con {professionalName}.
      </p>
      <a
        href="#reservar"
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition hover:brightness-110 sm:w-auto"
      >
        <CalendarIcon />
        Agendar una cita
      </a>
      <a
        href="#consultar"
        className="mt-3 block text-center text-sm text-brand underline-offset-4 hover:underline sm:text-left"
      >
        O escribile una consulta
      </a>
    </div>
  );
}

/** Ícono calendario (Lucide), hereda color/altura del contexto. */
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
