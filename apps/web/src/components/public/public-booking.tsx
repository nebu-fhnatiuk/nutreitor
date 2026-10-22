"use client";

import { useState } from "react";
import type { PublicBookingResult } from "@nutreitor/shared";

import { Input } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/datetime";
import { SlotPicker } from "@/components/scheduling/slot-picker";

/**
 * Reserva pública desde la vidriera: el visitante deja sus datos y elige un
 * horario libre del profesional. Crea el lead + la cita (sin login). Llama a los
 * endpoints públicos (el proxy agrega el secreto de borde).
 */
export function PublicBooking({
  slug,
  profileSlug,
  professionalName,
}: {
  slug: string;
  profileSlug: string;
  professionalName: string;
}) {
  const base = `public/orgs/${slug}/professionals/${profileSlug}`;
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState<PublicBookingResult | null>(null);

  async function pick(startsAt: string) {
    if (!fullName.trim() || !email.trim()) {
      throw new Error("Completá tu nombre y email antes de elegir un horario.");
    }
    const res = await api<PublicBookingResult>(`${base}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startsAt,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      }),
    });
    setDone(res);
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-brand/30 bg-surface p-6 shadow-sm">
        <h2 className="font-serif text-xl text-stone-900">¡Listo, {fullName.split(" ")[0]}!</h2>
        <p className="mt-2 text-stone-600">
          Reservaste una consulta con <span className="text-stone-900">{done.professionalName}</span>{" "}
          para el <span className="text-stone-900">{fmtDateTime(done.startsAt)}</span>. Te escribimos
          a <span className="text-stone-900">{email}</span> con los detalles.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-surface p-6 shadow-sm">
      <h2 className="font-serif text-xl text-stone-900">Reservá tu consulta</h2>
      <p className="mt-1 text-sm text-stone-500">
        Dejá tus datos y elegí un horario disponible con {professionalName}.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Tu nombre y apellido"
          autoComplete="name"
        />
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Tu email"
          type="email"
          autoComplete="email"
        />
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Teléfono (opcional)"
          autoComplete="tel"
        />
      </div>
      <div className="mt-5">
        <SlotPicker path={`${base}/slots`} onPick={pick} />
      </div>
    </div>
  );
}
