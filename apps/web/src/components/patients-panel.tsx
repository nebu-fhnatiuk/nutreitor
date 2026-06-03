"use client";

import { useCallback, useEffect, useState } from "react";
import type { PatientDto } from "@nutreitor/shared";

/**
 * Panel de pacientes del profesional. Consume /patients con la SESIÓN real (cookie
 * httpOnly vía el proxy); la API + RLS acotan al tenant del subdominio. No hay
 * selector de org: el tenant queda fijado por la sesión.
 */
export function PatientsPanel() {
  const [patients, setPatients] = useState<PatientDto[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/patients", { credentials: "include" });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message ?? `HTTP ${r.status}`);
      setPatients(data);
    } catch (e) {
      setError(String(e));
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const r = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ fullName: name.trim() }),
    });
    if (r.ok) {
      setName("");
      void load();
    } else {
      setError(`No se pudo crear (HTTP ${r.status})`);
    }
  }

  return (
    <div>
      <form onSubmit={add} className="mb-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nuevo paciente"
          className="flex-1 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-40"
        >
          Agregar
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-stone-200">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-3 text-sm text-stone-500">
          <span>Pacientes{loading && <span className="ml-2 text-stone-400">cargando…</span>}</span>
          <span className="font-mono text-xs text-stone-400">{patients.length}</span>
        </div>
        {patients.length === 0 && !loading ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">Sin pacientes.</div>
        ) : (
          <ul className="divide-y divide-stone-200">
            {patients.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                    {p.fullName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-stone-900">{p.fullName}</span>
                </div>
                <span className="font-mono text-xs text-stone-400">{p.region}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
