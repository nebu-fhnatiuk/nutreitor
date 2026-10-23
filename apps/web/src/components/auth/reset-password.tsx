"use client";

import { useEffect, useState } from "react";
import type { PasswordResetPreview } from "@nutreitor/shared";

import { Loading, ZoneMark } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { AuthButton, AuthHeading, AuthNotice, PasswordField, authButtonClass } from "./auth-shell";

const MIN = 8;

/** Regla de la contraseña con forma: rombo cumplida, círculo vacío pendiente. */
function Rule({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className="flex items-center gap-2.5">
      {ok ? <ZoneMark zone="ok" className="mx-0.5" /> : <span aria-hidden className="h-3 w-3 rounded-full border-2 border-stone-400" />}
      <span className={ok ? "text-stone-900" : "text-stone-600"}>{children}</span>
      <span className="sr-only">{ok ? "(cumplido)" : "(pendiente)"}</span>
    </li>
  );
}

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

  const longEnough = password.length >= MIN;
  const matches = password.length > 0 && password === password2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!matches) {
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
      <div role="alert">
        <span aria-hidden className="mb-5 block h-5 w-5 rounded-full bg-zone-bad" />
        <AuthHeading title="Este link ya no sirve">Venció (dura una hora) o ya lo usaste. Pedí uno nuevo con tu email.</AuthHeading>
        <a href={forgotHref} className={`${authButtonClass} mt-7`}>Pedir un link nuevo</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <AuthHeading kicker="Recuperar el acceso" title="Elegí tu contraseña nueva">
        Para <strong className="font-semibold text-stone-900">{preview.email}</strong>. Vale para todos tus espacios; vamos a
        cerrar las sesiones abiertas.
      </AuthHeading>
      {/* Para los gestores de contraseñas: a qué cuenta corresponde. */}
      <input type="email" value={preview.email} autoComplete="username" readOnly hidden />
      <div className="space-y-4 pt-3">
        {err && <AuthNotice zone="bad" title={err} />}
        <PasswordField label="Contraseña nueva" value={password} onChange={(e) => setPassword(e.target.value)} minLength={MIN} required autoComplete="new-password" />
        <PasswordField label="Repetila" value={password2} onChange={(e) => setPassword2(e.target.value)} minLength={MIN} required autoComplete="new-password" />
        <ul className="space-y-2 text-[15px]" aria-label="Requisitos">
          <Rule ok={longEnough}>{`${MIN} caracteres o más`}</Rule>
          <Rule ok={matches}>Las dos coinciden</Rule>
        </ul>
        <AuthButton type="submit" disabled={busy} className="!mt-6">
          {busy ? "Guardando…" : "Guardar y entrar"}
        </AuthButton>
      </div>
    </form>
  );
}
