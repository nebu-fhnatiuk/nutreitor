"use client";

import { useEffect, useState } from "react";
import type { OrgSignupCompleted, OrgSignupPreview } from "@nutreitor/shared";

import { AuthButton, AuthHeading, AuthNotice, PasswordField, authButtonClass } from "@/components/auth/auth-shell";
import { Loading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/**
 * Paso 2 del alta: el link ya probó el email. Si no hay cuenta se elige la
 * contraseña; si hay, se reusa. Al confirmar, la org nace en revisión y te
 * llevamos al login de tu subdominio con el email puesto.
 */
export function ConfirmSignup({ token }: { token: string }) {
  const [preview, setPreview] = useState<OrgSignupPreview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "invalid">("loading");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return setState("invalid");
    api<OrgSignupPreview>(`signup/lookup?token=${encodeURIComponent(token)}`)
      .then((p) => {
        setPreview(p);
        setState("ready");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (preview?.needsAccount && password !== password2) {
      setErr("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const done = await api<OrgSignupCompleted>("signup/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview?.needsAccount ? { token, password } : { token }),
      });
      window.location.assign(done.loginUrl);
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
        <AuthHeading title="Este link ya no sirve">Venció o ya se usó. Podés registrarte de nuevo.</AuthHeading>
        <a href="/registro" className={`${authButtonClass} mt-7`}>Volver al registro</a>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-4">
      <AuthHeading kicker="Último paso" title={`Hola, ${preview.fullName.split(" ")[0]}`}>
        Vas a crear <strong className="font-semibold text-stone-900">{preview.orgName}</strong> con la dirección{" "}
        <strong className="font-semibold text-stone-900">{preview.slug}</strong>, como administrador/a ({preview.email}).
      </AuthHeading>
      <div className="space-y-4 pt-3">
        {preview.needsAccount ? (
          <>
            <input type="email" value={preview.email} autoComplete="username" readOnly hidden />
            <PasswordField label="Elegí una contraseña" hint="Mínimo 8 caracteres." value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
            <PasswordField label="Repetila" value={password2} onChange={(e) => setPassword2(e.target.value)} minLength={8} required autoComplete="new-password" />
          </>
        ) : (
          <AuthNotice zone="ok" title="Ya tenés una cuenta con este email." live="status">
            Vas a entrar con tu contraseña de siempre.
          </AuthNotice>
        )}
        {err && <AuthNotice zone="bad" title={err} />}
        <AuthButton type="submit" disabled={busy} className="!mt-6">
          {busy ? "Creando…" : `Crear ${preview.orgName}`}
        </AuthButton>
      </div>
    </form>
  );
}
