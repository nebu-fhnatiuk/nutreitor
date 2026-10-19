"use client";

import { useEffect, useState } from "react";
import type { PasswordResetPreview } from "@nutreitor/shared";

import { Alert, Button, Input, Label, Loading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/**
 * Elegir la contraseña nueva desde el link (ADR 0029). Al guardarla se cierran todas
 * las sesiones y se vuelve a entrar con la nueva. `loginHref(email)` arma a dónde ir.
 */
export function ResetPassword({
  token,
  loginBase,
  forgotHref,
}: {
  token: string;
  /** Login al que se vuelve; se le agrega `?email=` (salvo la consola). */
  loginBase: string;
  forgotHref: string;
}) {
  const [preview, setPreview] = useState<PasswordResetPreview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "invalid">("loading");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return setState("invalid");
    api<PasswordResetPreview>(`auth/password/reset?token=${encodeURIComponent(token)}`)
      .then((p) => {
        setPreview(p);
        setState("ready");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) {
      setErr("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const done = await api<PasswordResetPreview>("auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const sep = loginBase.includes("?") ? "&" : "?";
      window.location.assign(
        loginBase.endsWith("/login") ? `${loginBase}${sep}email=${encodeURIComponent(done.email)}&restablecida=1` : loginBase,
      );
    } catch (e2) {
      setErr(errorMessage(e2));
      setBusy(false);
    }
  }

  if (state === "loading") return <Loading label="Verificando el link…" />;
  if (state === "invalid" || !preview) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">El link no es válido</h1>
        <p className="mt-2 text-sm text-stone-600">Venció o ya se usó. Pedí uno nuevo.</p>
        <a href={forgotHref} className="mt-6 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline">
          Pedir otro link
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Elegí tu contraseña nueva</h1>
        <p className="mt-1 text-sm text-stone-600">
          Para <span className="font-medium text-stone-900">{preview.email}</span>. Vale para todos tus
          espacios; vamos a cerrar las sesiones abiertas.
        </p>
      </div>
      {/* Para los gestores de contraseñas: a qué cuenta corresponde. */}
      <input type="email" value={preview.email} autoComplete="username" readOnly hidden />
      <Label label="Contraseña nueva" hint="Mínimo 8 caracteres.">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
      </Label>
      <Label label="Repetila">
        <Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} minLength={8} required autoComplete="new-password" />
      </Label>
      {err && <Alert>{err}</Alert>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Guardando…" : "Guardar y entrar"}
      </Button>
    </form>
  );
}
