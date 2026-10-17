"use client";

import { useState } from "react";
import type { BrandingDto } from "@nutreitor/shared";

import { Alert, Button, Input } from "@/components/ui";

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
        <label htmlFor="branding-form-nombre-visible" className="mb-1 block text-sm text-stone-500">Nombre visible</label>
        <Input
          id="branding-form-nombre-visible"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Nombre que ven los pacientes"
        />
      </div>
      <div>
        <label htmlFor="branding-form-color" className="mb-1 block text-sm text-stone-500">Color primario</label>
        <div className="flex items-center gap-3">
          <input
            id="branding-form-color"
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
        <label htmlFor="branding-form-url-del-logo-opcional" className="mb-1 block text-sm text-stone-500">URL del logo (opcional)</label>
        <Input
          id="branding-form-url-del-logo-opcional"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://…/logo.png"
        />
      </div>

      {err && <Alert>{err}</Alert>}
      {msg && <p className="text-sm text-brand">{msg}</p>}

      <Button type="submit" disabled={busy}>
        {busy ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
