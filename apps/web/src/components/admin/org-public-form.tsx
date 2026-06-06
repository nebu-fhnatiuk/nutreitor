"use client";

import { useState } from "react";

import { Alert, Button, Input, Textarea } from "@/components/ui";

/**
 * Editor de la página pública de la org (headline + descripción). Distinto del
 * branding (colores/logo): esto es el copy de la vidriera de captación.
 */
export function OrgPublicForm({
  initial,
}: {
  initial: { publicHeadline: string | null; publicDescription: string | null };
}) {
  const [headline, setHeadline] = useState(initial.publicHeadline ?? "");
  const [description, setDescription] = useState(initial.publicDescription ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/editor/public-profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicHeadline: headline.trim() || null,
          publicDescription: description.trim() || null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message ?? `HTTP ${r.status}`);
      setMsg("Página pública actualizada.");
    } catch (e2) {
      setErr(String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-lg space-y-5">
      <div>
        <label className="mb-1 block text-sm text-stone-500">Titular</label>
        <Input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={160}
          placeholder="Una frase que resuma la propuesta"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-stone-500">Descripción</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          rows={5}
          placeholder="Presentá la organización a quien llega a la página."
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
