"use client";

import { useCallback, useEffect, useState } from "react";
import {
  membershipRoles,
  type Capability,
  type InvitationDto,
  type MemberDto,
  type MembershipRole,
} from "@nutreitor/shared";

import { Alert, Button, Input, PageHeader, Select, useFeedback } from "@/components/ui";
import { errorMessage } from "@/lib/api";

const ROLE_LABEL: Record<MembershipRole, string> = {
  admin: "Admin",
  professional: "Profesional",
  patient: "Paciente",
  coach: "Cuerpo técnico",
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
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const { confirm, toast } = useFeedback();
  /** Corre la acción sólo si se confirma, y avisa al terminar. */
  async function confirmRun(
    opts: Parameters<typeof confirm>[0],
    fn: () => Promise<unknown>,
    done: string,
  ) {
    if (!(await confirm(opts))) return;
    run(async () => {
      await fn();
      toast(done);
    });
  }

  function run(fn: () => Promise<unknown>) {
    fn()
      .then(() => load(search))
      .catch((e) => setError(errorMessage(e)));
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Miembros"
        description="Profesionales y pacientes con acceso a la organización: invitaciones, roles y bajas."
        className="mb-0"
      />

      {error && <Alert>{error}</Alert>}

      {can("member:invite") && (
        <InviteForm onInvited={() => load(search)} onError={setError} />
      )}

      {/* Invitaciones pendientes */}
      {invites.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-stone-500">
            Invitaciones pendientes
          </h2>
          <div className="overflow-hidden rounded-xl border border-stone-200">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-stone-200">
                {invites.map((inv) => (
                  <tr key={inv.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 text-stone-800">{inv.email}</td>
                    <td className="px-4 py-3">
                      <Badge>{ROLE_LABEL[inv.role]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-500">
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
                          onClick={() =>
                            void confirmRun(
                              {
                                title: "¿Revocar la invitación?",
                                body: `El link que recibió ${inv.email} deja de funcionar.`,
                                confirmLabel: "Revocar",
                                tone: "danger",
                              },
                              () => api(`invitations/${inv.id}/revoke`, { method: "POST" }),
                              "Invitación revocada",
                            )
                          }
                          className="text-xs text-stone-500 hover:text-red-700"
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
          <h2 className="text-xs font-medium uppercase tracking-widest text-stone-500">
            Miembros{loading && <span className="ml-2 text-stone-500">cargando…</span>}
          </h2>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              void load(e.target.value);
            }}
            placeholder="Buscar por nombre o email"
            className="w-64"
          />
        </div>
        <div className="overflow-hidden rounded-xl border border-stone-200">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-stone-200">
              {members.map((m) => (
                <tr key={m.membershipId} className="hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                        {(m.fullName || m.email).slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <div className="text-stone-900">{m.fullName}</div>
                        <div className="text-xs text-stone-500">{m.email}</div>
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
                        className="rounded-md border border-stone-200 bg-surface px-2 py-1 text-xs"
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
                      <span className="text-xs text-emerald-600">activo</span>
                    ) : (
                      <span className="text-xs text-stone-500">dado de baja</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {can("member:revoke") && m.status === "active" && (
                      <button
                        onClick={() =>
                          void confirmRun(
                            {
                              title: `¿Dar de baja a ${m.fullName}?`,
                              body: "Pierde el acceso a la organización. Su historia (notas, planes) se conserva.",
                              confirmLabel: "Dar de baja",
                              tone: "danger",
                            },
                            () => api(`members/${m.membershipId}/revoke`, { method: "POST" }),
                            "Miembro dado de baja",
                          )
                        }
                        className="text-xs text-stone-500 hover:text-red-700"
                      >
                        Dar de baja
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-stone-500">
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
    <span className="rounded-full border border-stone-200 px-2 py-0.5 text-xs text-stone-700">
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
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-surface p-4">
      <div className="flex-1">
        <label htmlFor="members-admin-invitar-por-email" className="mb-1 block text-xs text-stone-500">Invitar por email</label>
        <Input
          id="members-admin-invitar-por-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="persona@email.com"
        />
      </div>
      <Select
        value={role}
        onChange={(e) => setRole(e.target.value as MembershipRole)}
        className="w-auto"
      >
        {membershipRoles.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={busy || !email.trim()}>
        {busy ? "Invitando…" : "Invitar"}
      </Button>
    </form>
  );
}
