"use client";

import { useEffect, useState } from "react";
import type { InvitationPreview } from "@nutreitor/shared";

import { AuthButton, AuthField, AuthHeading, AuthNotice, PasswordField } from "@/components/auth/auth-shell";
import { Loading } from "@/components/ui";
import { errorMessage } from "@/lib/api";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador/a",
  professional: "Profesional",
  patient: "Deportista",
};

/**
 * Aceptar una invitación (KAN-77): el club y el rol a la vista; si el email todavía
 * no es una cuenta, se elige nombre y contraseña. Con `next` (un formulario pedido),
 * el deportista entra directo ahí.
 */
export function AcceptInvite({ token, next }: { token: string; next?: string }) {
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "invalid">("loading");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    fetch(`/api/invitations/lookup?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p: InvitationPreview) => {
        setPreview(p);
        setState("ready");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, string> = { token };
      if (preview?.needsAccount) {
        body.password = password;
        body.fullName = fullName;
      }
      const r = await fetch("/api/invitations/accept", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message ?? `HTTP ${r.status}`);
      window.location.assign(next && preview?.role === "patient" ? next : d.redirect);
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <Loading label="Verificando la invitación…" />;
  if (state === "invalid" || !preview) {
    return (
      <div role="alert">
        <span aria-hidden className="mb-5 block h-5 w-5 rounded-full bg-zone-bad" />
        <AuthHeading title="Esta invitación ya no sirve">
          Venció o ya se usó. Pedile a quien te invitó que te mande una nueva.
        </AuthHeading>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading kicker="Te invitaron" title={`Sumate a ${preview.orgName}`} />
      <dl className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-xl border border-stone-200 bg-surface px-4 py-3.5 text-[15px]">
        <dt className="self-center font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-stone-500">Como</dt>
        <dd className="font-semibold text-stone-900">{ROLE_LABEL[preview.role] ?? preview.role}</dd>
        <dt className="self-center font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-stone-500">Email</dt>
        <dd className="truncate text-stone-900">{preview.email}</dd>
      </dl>

      <form onSubmit={accept} className="mt-6 space-y-4">
        {preview.needsAccount && (
          <>
            <input type="email" value={preview.email} autoComplete="username" readOnly hidden />
            <AuthField label="Tu nombre" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" placeholder="Nombre y apellido" />
            <PasswordField
              label="Elegí una contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="8 caracteres o más"
            />
          </>
        )}
        {err && <AuthNotice zone="bad" title={err} />}
        <AuthButton type="submit" disabled={busy} className="!mt-6">
          {busy ? "Aceptando…" : preview.needsAccount ? "Aceptar y entrar" : "Aceptar invitación"}
        </AuthButton>
      </form>
    </div>
  );
}
