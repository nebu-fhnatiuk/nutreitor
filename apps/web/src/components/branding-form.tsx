"use client";

import { useState } from "react";
import type { BrandingDto } from "@nutreitor/shared";

/** Editor de branding white-label (acotado): nombre visible, color, logo. */
export function BrandingForm({ initial }: { initial: BrandingDto | null }) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [color, setColor] = useState(initial?.brandPrimaryColor ?? "#10b981");
  const [logoUrl, setLogoUrl] = useState(initial?.brandLogoUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/editor/branding", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          brandPrimaryColor: color || null,
          brandLogoUrl: logoUrl.trim() || null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message ?? `HTTP ${r.status}`);
      setMsg("Branding actualizado. Aplicando…");
      setTimeout(() => window.location.reload(), 700);
    } catch (e2) {
      setErr(String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-lg space-y-5">
      <div>
        <label className="mb-1 block text-sm text-stone-500">Nombre visible</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Nombre que ven los pacientes"
          className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-stone-500">Color primario</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-lg border border-stone-200 bg-white"
          />
          <span className="font-mono text-sm text-stone-500">{color}</span>
          <span
            className="ml-auto inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: color, color: "#040a08" }}
          >
            Vista previa
          </span>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm text-stone-500">URL del logo (opcional)</label>
        <input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://…/logo.png"
          className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {err && <p className="text-sm text-red-700">{err}</p>}
      {msg && <p className="text-sm text-brand">{msg}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
