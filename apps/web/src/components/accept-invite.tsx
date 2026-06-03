"use client";

import { useEffect, useState } from "react";
import type { InvitationPreview } from "@nutreitor/shared";

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
      setErr(String(e2));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <p className="text-sm text-zinc-500">Verificando invitación…</p>;
  }
  if (state === "invalid" || !preview) {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-bold">Invitación inválida</h1>
        <p className="mt-2 text-sm text-zinc-500">
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
      <h1 className="text-2xl font-bold tracking-tight">Te invitaron a {preview.orgName}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Como <span className="text-zinc-300">{ROLE_LABEL[preview.role] ?? preview.role}</span> ·{" "}
        {preview.email}
      </p>

      <form onSubmit={accept} className="mt-8 space-y-4">
        {preview.needsAccount && (
          <>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Tu nombre</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-brand/60"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-brand/60"
              />
            </div>
          </>
        )}

        {err && <p className="text-sm text-red-300">{err}</p>}

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
