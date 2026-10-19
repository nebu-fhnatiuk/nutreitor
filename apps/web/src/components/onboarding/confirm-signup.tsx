"use client";

import { useEffect, useState } from "react";
import type { OrgSignupCompleted, OrgSignupPreview } from "@nutreitor/shared";

import { Alert, Button, Input, Label, Loading } from "@/components/ui";
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
      <div className="text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">El link no es válido</h1>
        <p className="mt-2 text-sm text-ink/65">Venció o ya se usó. Podés registrarte de nuevo.</p>
        <a href="/registro" className="mt-6 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline">
          Volver al registro
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="rounded-3xl border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-extrabold tracking-tight">Último paso, {preview.fullName.split(" ")[0]}</h1>
      <p className="mt-2 text-sm text-ink/65">
        Vas a crear <span className="font-medium text-ink">{preview.orgName}</span> con la
        dirección <span className="font-medium text-ink">{preview.slug}</span>, como
        administrador/a ({preview.email}).
      </p>

      {preview.needsAccount ? (
        <div className="mt-6 space-y-4">
          <Label label="Elegí una contraseña" hint="Mínimo 8 caracteres.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
          </Label>
          <Label label="Repetila">
            <Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} minLength={8} required autoComplete="new-password" />
          </Label>
        </div>
      ) : (
        <p className="mt-6 rounded-xl bg-stone-50 p-3 text-sm text-ink/70">
          Ya tenés una cuenta en Nutreitor con este email: vas a entrar con tu contraseña de siempre.
        </p>
      )}

      {err && <div className="mt-4"><Alert>{err}</Alert></div>}

      <Button type="submit" disabled={busy} className="mt-6 w-full">
        {busy ? "Creando…" : `Crear ${preview.orgName}`}
      </Button>
    </form>
  );
}
