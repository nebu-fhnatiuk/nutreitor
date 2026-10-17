"use client";

import { useEffect, useState } from "react";
import type { InvitationPreview } from "@nutreitor/shared";
import { errorMessage } from "@/lib/api";

const ROLE_LABEL: Record<string, string> = {
  admin: "administrador/a",
  professional: "profesional",
  patient: "paciente",
};

export function AcceptInvite({ token }: { token: string }) {
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
      window.location.assign(d.redirect);
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <p className="text-sm text-stone-500">Verificando invitación…</p>;
  }
  if (state === "invalid" || !preview) {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="font-serif text-xl font-semibold">Invitación inválida</h1>
        <p className="mt-2 text-sm text-stone-500">
          El link expiró o ya fue usado. Pedí una invitación nueva.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_12px_rgb(var(--brand-rgb))]" />
        <span className="text-lg font-semibold tracking-tight">{preview.orgName}</span>
      </div>
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Te invitaron a {preview.orgName}</h1>
      <p className="mt-1 text-sm text-stone-500">
        Como <span className="text-stone-700">{ROLE_LABEL[preview.role] ?? preview.role}</span> ·{" "}
        {preview.email}
      </p>

      <form onSubmit={accept} className="mt-8 space-y-4">
        {preview.needsAccount && (
          <>
            <div>
              <label htmlFor="accept-invite-tu-nombre" className="mb-1 block text-sm text-stone-500">Tu nombre</label>
              <input
                id="accept-invite-tu-nombre"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div>
              <label htmlFor="accept-invite-contrasena" className="mb-1 block text-sm text-stone-500">Contraseña</label>
              <input
                id="accept-invite-contrasena"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </>
        )}

        {err && <p className="text-sm text-red-700">{err}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Aceptando…" : "Aceptar invitación"}
        </button>
      </form>
    </div>
  );
}
