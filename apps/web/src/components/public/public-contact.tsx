"use client";

import { useState } from "react";
import type { PublicContactResult } from "@nutreitor/shared";

import { Alert, Input, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/**
 * Consulta desde la vidriera (ADR 0027): para quien todavía no quiere reservar un
 * turno. Le llega sólo al profesional (o al consultorio, sin `profileSlug`). Sin
 * login; el proxy agrega el secreto de borde. `website` es un honeypot oculto.
 */
export function PublicContact({
  slug,
  profileSlug,
  recipientName,
}: {
  slug: string;
  profileSlug?: string;
  recipientName: string;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<PublicContactResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      setDone(
        await api<PublicContactResult>(`public/orgs/${slug}/contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileSlug,
            fullName: fullName.trim(),
            email: email.trim(),
            phone: phone.trim() || undefined,
            message: message.trim(),
            consent,
            website: website || undefined,
          }),
        }),
      );
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-brand/30 bg-white p-6 shadow-sm" role="status">
        <h2 className="font-serif text-xl text-stone-900">¡Gracias, {fullName.split(" ")[0]}!</h2>
        <p className="mt-2 text-stone-600">
          Le hicimos llegar tu consulta a <span className="text-stone-900">{done.to}</span>. Te van a
          responder a <span className="text-stone-900">{email}</span>.
        </p>
      </div>
    );
  }

  const field = "mb-1 block text-xs text-stone-500";
  return (
    <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="font-serif text-xl text-stone-900">Escribile a {recipientName}</h2>
      <p className="mt-1 text-sm text-stone-600">
        ¿Tenés dudas antes de reservar? Dejá tu consulta y te responden por email.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={field}>Tu nombre</span>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" />
        </label>
        <label className="block">
          <span className={field}>Email</span>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="block sm:col-span-2">
          <span className={field}>Teléfono (opcional)</span>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} autoComplete="tel" />
        </label>
        <label className="block sm:col-span-2">
          <span className={field}>Tu consulta</span>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            required
            minLength={10}
            maxLength={1000}
            placeholder="Contá brevemente qué buscás (objetivo, si tenés alguna condición, disponibilidad)."
          />
          <span className="mt-1 block text-right text-xs text-stone-400">{message.length}/1000</span>
        </label>
        {/* Honeypot: invisible para personas, lo completan los bots. */}
        <label className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
          Sitio web
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-2 text-sm text-stone-600">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" required />
        <span>
          Acepto que {recipientName} use estos datos para responder mi consulta. No se
          comparten con nadie más.
        </span>
      </label>

      {err && <div className="mt-4"><Alert>{err}</Alert></div>}

      <button
        type="submit"
        disabled={busy || !consent}
        className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition hover:brightness-110 disabled:opacity-50 sm:w-auto"
      >
        {busy ? "Enviando…" : "Enviar consulta"}
      </button>
    </form>
  );
}
