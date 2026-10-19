"use client";

import { MailCheck } from "lucide-react";
import { useState } from "react";

import { Alert, Button, Input, Label } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

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

  if (sent) {
    return (
      <div className="text-center" role="status">
        <MailCheck className="mx-auto h-10 w-10 text-brand" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Revisá tu email</h1>
        <p className="mt-2 text-sm text-stone-600">
          Si <span className="font-medium text-stone-900">{email.trim()}</span> tiene una cuenta en
          Nutreitor, te mandamos un link para elegir una contraseña nueva. Vence en una hora.
        </p>
        <a href={backHref} className="mt-6 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline">
          {backLabel}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">¿Olvidaste tu contraseña?</h1>
        <p className="mt-1 text-sm text-stone-600">
          Escribí tu email y te mandamos un link para elegir una nueva. Es la misma contraseña para
          todos tus espacios en Nutreitor.
        </p>
      </div>
      <Label label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </Label>
      {err && <Alert>{err}</Alert>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Enviando…" : "Mandame el link"}
      </Button>
      <p className="text-center text-sm">
        <a href={backHref} className="text-stone-600 underline-offset-4 hover:text-brand hover:underline">
          {backLabel}
        </a>
      </p>
    </form>
  );
}
