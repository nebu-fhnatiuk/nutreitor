"use client";

import { useCallback, useEffect, useState } from "react";
import {
  membershipRoles,
  type Capability,
  type InvitationDto,
  type MemberDto,
  type MembershipRole,
} from "@nutreitor/shared";

const ROLE_LABEL: Record<MembershipRole, string> = {
  admin: "Admin",
  professional: "Profesional",
  patient: "Paciente",
};

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`/api/${path}`, { credentials: "include", ...init });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message ?? `HTTP ${r.status}`);
  return data;
}

export function MembersAdmin({ capabilities }: { capabilities: Capability[] }) {
  const can = (c: Capability) => capabilities.includes(c);

  const [members, setMembers] = useState<MemberDto[]>([]);
  const [invites, setInvites] = useState<InvitationDto[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = term ? `?search=${encodeURIComponent(term)}` : "";
      const [m, inv] = await Promise.all([
        api(`members${qs}`),
        can("member:read") ? api("invitations") : Promise.resolve([]),
      ]);
      setMembers(m);
      setInvites(inv);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  function run(fn: () => Promise<unknown>) {
    fn()
      .then(() => load(search))
      .catch((e) => setError(String(e)));
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Miembros</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Gestión de profesionales y pacientes de la organización.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
          {error}
        </div>
      )}

      {can("member:invite") && (
        <InviteForm onInvited={() => load(search)} onError={setError} />
      )}

      {/* Invitaciones pendientes */}
      {invites.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">
            Invitaciones pendientes
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-900">
                {invites.map((inv) => (
                  <tr key={inv.id} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-3 text-zinc-200">{inv.email}</td>
                    <td className="px-4 py-3">
                      <Badge>{ROLE_LABEL[inv.role]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {inv.status === "expired" ? "expirada" : "pendiente"} · vence{" "}
                      {new Date(inv.expiresAt).toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {can("member:invite") && (
                        <button
                          onClick={() => run(() => api(`invitations/${inv.id}/resend`, { method: "POST" }))}
                          className="mr-3 text-xs text-brand hover:underline"
                        >
                          Reenviar
                        </button>
                      )}
                      {can("member:revoke") && (
                        <button
                          onClick={() => run(() => api(`invitations/${inv.id}/revoke`, { method: "POST" }))}
                          className="text-xs text-zinc-500 hover:text-red-300"
                        >
                          Revocar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Miembros */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Miembros{loading && <span className="ml-2 text-zinc-600">cargando…</span>}
          </h2>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              void load(e.target.value);
            }}
            placeholder="Buscar por nombre o email"
            className="w-64 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm outline-none placeholder:text-zinc-600 focus:border-brand/60"
          />
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-900">
              {members.map((m) => (
                <tr key={m.membershipId} className="hover:bg-zinc-900/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                        {(m.fullName || m.email).slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <div className="text-zinc-100">{m.fullName}</div>
                        <div className="text-xs text-zinc-500">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {can("member:change_role") && m.status === "active" ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          run(() =>
                            api(`members/${m.membershipId}/role`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ role: e.target.value }),
                            }),
                          )
                        }
                        className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs"
                      >
                        {membershipRoles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge>{ROLE_LABEL[m.role]}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {m.status === "active" ? (
                      <span className="text-xs text-emerald-400">activo</span>
                    ) : (
                      <span className="text-xs text-zinc-600">dado de baja</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {can("member:revoke") && m.status === "active" && (
                      <button
                        onClick={() => run(() => api(`members/${m.membershipId}/revoke`, { method: "POST" }))}
                        className="text-xs text-zinc-500 hover:text-red-300"
                      >
                        Dar de baja
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-600">
                    Sin miembros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
      {children}
    </span>
  );
}

function InviteForm({
  onInvited,
  onError,
}: {
  onInvited: () => void;
  onError: (e: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MembershipRole>("professional");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    onError("");
    try {
      await api("invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      setEmail("");
      onInvited();
    } catch (err) {
      onError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex-1">
        <label className="mb-1 block text-xs text-zinc-500">Invitar por email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="persona@email.com"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-brand/60"
        />
      </div>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as MembershipRole)}
        className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
      >
        {membershipRoles.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-40"
      >
        {busy ? "Invitando…" : "Invitar"}
      </button>
    </form>
  );
}
