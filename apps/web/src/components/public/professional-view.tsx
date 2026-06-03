import type { PublicProfessional } from "@nutreitor/shared";

import { BookingCta } from "./booking-cta";

/**
 * Vidriera pública del profesional (presentacional). Recibe SÓLO campos públicos
 * (el serializer del backend ya filtró por visibilidad). Estética editorial clara,
 * acento de marca del tenant (`brand`), responsive/mobile-first.
 */
export function ProfessionalView({
  professional,
  orgName,
  backHref,
}: {
  professional: PublicProfessional;
  orgName: string;
  backHref?: string;
}) {
  const p = professional;
  const initial = (p.fullName || "?").slice(0, 1).toUpperCase();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      {backHref && (
        <a
          href={backHref}
          className="mb-8 inline-block text-sm text-stone-500 transition hover:text-brand"
        >
          ← {orgName}
        </a>
      )}

      {/* Hero */}
      <header className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        {p.photoUrl ? (
          <img
            src={p.photoUrl}
            alt={p.fullName}
            className="h-24 w-24 rounded-2xl object-cover sm:h-28 sm:w-28"
          />
        ) : (
          <div className="grid h-24 w-24 place-items-center rounded-2xl bg-brand/15 text-3xl font-semibold text-brand sm:h-28 sm:w-28">
            {initial}
          </div>
        )}
        <div>
          <p className="font-medium uppercase tracking-widest text-brand">
            {orgName}
          </p>
          <h1 className="mt-1 font-serif text-4xl leading-tight text-stone-900 sm:text-5xl">
            {p.fullName}
          </h1>
          {p.headline && (
            <p className="mt-2 text-lg text-stone-600">{p.headline}</p>
          )}
        </div>
      </header>

      <div className="mt-12 grid gap-10 sm:grid-cols-[1fr_18rem]">
        <div className="space-y-10">
          {p.bio && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                Sobre mí
              </h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-stone-700">
                {p.bio}
              </p>
            </section>
          )}

          {p.specialties.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                Especialidades
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {p.specialties.map((s) => (
                  <li
                    key={s}
                    className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-sm text-stone-700"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.credentials && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                Formación
              </h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-stone-700">
                {p.credentials}
              </p>
            </section>
          )}

          {p.services.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                Servicios
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {p.services.map((s, i) => (
                  <div
                    key={`${s.name}-${i}`}
                    className="rounded-xl border border-stone-200 p-4"
                  >
                    <div className="font-medium text-stone-900">{s.name}</div>
                    {s.description && (
                      <p className="mt-1 text-sm text-stone-600">{s.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!p.bio &&
            !p.credentials &&
            p.specialties.length === 0 &&
            p.services.length === 0 && (
              <p className="text-stone-500">
                Este profesional todavía no publicó su perfil.
              </p>
            )}
        </div>

        <aside className="sm:sticky sm:top-12 sm:self-start">
          <BookingCta professionalName={p.fullName} />
        </aside>
      </div>
    </div>
  );
}
