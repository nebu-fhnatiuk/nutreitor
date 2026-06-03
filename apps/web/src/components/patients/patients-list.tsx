"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MemberDto, PatientDto } from "@nutreitor/shared";

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`/api/${path}`, { credentials: "include", ...init });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message ?? `HTTP ${r.status}`);
  return data;
}

/**
 * Listado de pacientes, scopeado por la API (admin → todos; profesional → sólo
 * asignados). Herramienta de trabajo: denso y rápido de leer. `basePath` arma el
 * link a la ficha; `canAssign` habilita el atajo crear-y-asignar (admin).
 */
export function PatientsList({
  basePath,
  canCreate,
  canAssign,
}: {
  basePath: string;
  canCreate: boolean;
  canAssign: boolean;
}) {
  const [patients, setPatients] = useState<PatientDto[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = term ? `?search=${encodeURIComponent(term)}` : "";
      setPatients(await api(`patients${qs}`));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  return (
    <div className="space-y-6">
      {canCreate && (
        <NewPatientForm
          canAssign={canAssign}
          onCreated={() => load(search)}
          onError={setError}
        />
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          Pacientes{loading && <span className="ml-2 text-stone-400">cargando…</span>}
        </h2>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            void load(e.target.value);
          }}
          placeholder="Buscar por nombre, documento o email"
          className="w-72 max-w-[55%] rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {patients.length === 0 && !loading ? (
          <div className="px-5 py-12 text-center text-sm text-stone-400">
            {search ? "Sin resultados." : "Todavía no hay pacientes."}
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {patients.map((p) => (
              <li key={p.id}>
                <Link
                  href={`${basePath}/${p.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-stone-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
                    {p.fullName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-stone-900">
                      {p.fullName}
                    </div>
                    <div className="truncate text-xs text-stone-500">
                      {p.documentId ? `Doc ${p.documentId}` : "Sin documento"}
                      {p.email ? ` · ${p.email}` : ""}
                    </div>
                  </div>
                  {p.activeProfessionals.length > 0 && (
                    <div className="hidden max-w-[40%] flex-wrap justify-end gap-1 sm:flex">
                      {p.activeProfessionals.map((name) => (
                        <span
                          key={name}
                          className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.hasAccount && (
                    <span className="hidden text-xs text-brand sm:inline">cuenta</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NewPatientForm({
  canAssign,
  onCreated,
  onError,
}: {
  canAssign: boolean;
  onCreated: () => void;
  onError: (e: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [pros, setPros] = useState<MemberDto[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canAssign || !open) return;
    api("members")
      .then((m: MemberDto[]) =>
        setPros(m.filter((x) => x.status === "active" && x.role !== "patient")),
      )
      .catch(() => setPros([]));
  }, [canAssign, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setBusy(true);
    onError("");
    try {
      await api("patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim() || undefined,
          assignToMembershipId: assignTo || undefined,
        }),
      });
      setFullName("");
      setEmail("");
      setAssignTo("");
      setOpen(false);
      onCreated();
    } catch (err) {
      onError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110"
      >
        + Nuevo paciente
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
    >
      <div className="flex-1 min-w-[12rem]">
        <label className="mb-1 block text-xs text-stone-500">Nombre y apellido</label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoFocus
          placeholder="Nombre del paciente"
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>
      <div className="flex-1 min-w-[12rem]">
        <label className="mb-1 block text-xs text-stone-500">Email (opcional)</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contacto@email.com"
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>
      {canAssign && (
        <div className="min-w-[12rem]">
          <label className="mb-1 block text-xs text-stone-500">
            Asignar profesional (opcional)
          </label>
          <select
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            <option value="">Sin asignar</option>
            {pros.map((p) => (
              <option key={p.membershipId} value={p.membershipId}>
                {p.fullName} ({p.role})
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !fullName.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Creando…" : "Crear paciente"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-2 text-sm text-stone-500 transition hover:bg-stone-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
