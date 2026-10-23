"use client";

import { ChevronLeft } from "lucide-react";
import { useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { AuthButton, AuthField, AuthHeading, AuthLink, AuthNotice, authButtonClass } from "./auth-shell";

/**
 * Pedir el link de recuperación (ADR 0029). La respuesta es la misma exista o no la
 * cuenta: el mensaje final no confirma nada.
 */
export function ForgotPassword({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <AuthLink href={backHref} className="-ml-1 mb-6">
      <ChevronLeft className="h-4 w-4" aria-hidden /> {backLabel}
    </AuthLink>
  );

  if (sent) {
    return (
      <div role="status">
        {back}
        <span aria-hidden className="mb-5 ml-1 block h-5 w-5 rotate-45 rounded-[2px] bg-zone-ok" />
        <AuthHeading title="Revisá tu email">
          Si <strong className="font-semibold text-stone-900">{email.trim()}</strong> tiene una cuenta en Nutreitor, ya te
          mandamos el link para elegir una contraseña nueva. Vence en una hora.
        </AuthHeading>
        <p className="mt-3 text-[15px] text-stone-500">¿No aparece? Mirá en spam o pedí otro (hasta 3 por hora).</p>
        <a href={backHref} className={`${authButtonClass} mt-7`}>{backLabel}</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {back}
      <AuthHeading kicker="Recuperar el acceso" title="¿Olvidaste tu contraseña?">
        Te mandamos un link para elegir una nueva. Es la misma contraseña para todos tus espacios en Nutreitor.
      </AuthHeading>
      <div className="space-y-4 pt-3">
        {err && <AuthNotice zone="bad" title={err} />}
        <AuthField
          label="Email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="vos@club.com"
        />
        <AuthButton type="submit" disabled={busy} className="!mt-6">
          {busy ? "Enviando…" : "Mandame el link"}
        </AuthButton>
      </div>
    </form>
  );
}
