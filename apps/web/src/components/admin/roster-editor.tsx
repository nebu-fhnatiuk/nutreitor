"use client";

import { useState } from "react";
import type { RosterAdminEntry } from "@nutreitor/shared";

import { Button, EmptyState, Input } from "@/components/ui";
import { errorMessage } from "@/lib/api";

/**
 * Curaduría del roster público (admin): presencia, orden y especialidad por
 * profesional. El contenido y la visibilidad por campo los edita cada profesional;
 * acá sólo se decide quién aparece y en qué orden. Cada fila guarda por separado.
 */
export function RosterEditor({ initial }: { initial: RosterAdminEntry[] }) {
  if (initial.length === 0) {
    return (
      <EmptyState>Todavía no hay profesionales con perfil en la organización.</EmptyState>
    );
  }
  return (
    <ul className="space-y-3">
      {initial.map((entry) => (
        <RosterRow key={entry.membershipId} entry={entry} />
      ))}
    </ul>
  );
}

function RosterRow({ entry }: { entry: RosterAdminEntry }) {
  const [listed, setListed] = useState(entry.isPubliclyListed);
  const [order, setOrder] = useState(String(entry.displayOrder));
  const [specialty, setSpecialty] = useState(entry.specialty ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Listado pero sin contenido público mínimo → no aparece en la vidriera (Ajuste 1).
  const hiddenForEmpty = listed && !entry.hasPublicContent;

  async function save() {
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      const r = await fetch(`/api/editor/roster/${entry.membershipId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPubliclyListed: listed,
          displayOrder: Number(order) || 0,
          specialty: specialty.trim() || null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message ?? `HTTP ${r.status}`);
      setSaved(true);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-stone-900">{entry.fullName}</div>
          <div className="truncate font-mono text-xs text-stone-500">
            /{entry.profileSlug}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={listed}
            onChange={(e) => setListed(e.target.checked)}
            className="h-4 w-4 accent-[rgb(var(--brand-rgb))]"
          />
          Listado
        </label>

        <label className="flex items-center gap-2 text-sm text-stone-500">
          Orden
          <Input
            type="number"
            min={0}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="w-16"
          />
        </label>

        <Input
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          placeholder="Especialidad"
          maxLength={120}
          className="w-44"
        />

        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "…" : "Guardar"}
        </Button>
      </div>

      {hiddenForEmpty && (
        <p className="mt-2 text-xs text-amber-300/80">
          Listado pero sin contenido público (titular o bio): no aparece en la
          vidriera hasta que el profesional publique su perfil.
        </p>
      )}
      {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
      {saved && <p className="mt-2 text-xs text-brand">Guardado.</p>}
    </li>
  );
}
