"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ACCESS_LOG_WINDOW_MIN,
  ACCESS_RESOURCE_LABEL,
  type AccessLogEntry,
  type AccessResource,
  type MembershipRole,
} from "@nutreitor/shared";

import { Button, Card, Loading, SectionHeading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

const PAGE = 100;
const WINDOW_MS = ACCESS_LOG_WINDOW_MIN * 60_000;

const ROLE_LABEL: Partial<Record<MembershipRole, string>> = {
  admin: "Administración",
  professional: "Profesional",
};

/** Una visita = misma persona en la misma ventana de 15 min: se listan qué miró. */
interface Visit {
  key: string;
  at: Date;
  actor: string;
  role: string;
  resources: AccessResource[];
}

function toVisits(entries: AccessLogEntry[]): Visit[] {
  const byKey = new Map<string, Visit>();
  for (const e of entries) {
    const at = new Date(e.createdAt);
    const key = `${e.actorUserId ?? "?"}-${Math.floor(at.getTime() / WINDOW_MS)}`;
    const v = byKey.get(key);
    if (v) {
      if (!v.resources.includes(e.resource)) v.resources.push(e.resource);
    } else {
      byKey.set(key, {
        key,
        at,
        actor: e.actorName ?? "Cuenta eliminada",
        role: ROLE_LABEL[e.actorRole] ?? e.actorRole,
        resources: [e.resource],
      });
    }
  }
  return [...byKey.values()];
}

const when = (d: Date) =>
  d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * Quién del staff vio los datos de este deportista (KAN-23, ADR 0042). Sólo la
 * admin. Las lecturas se registran una vez cada 15 min por persona y sección.
 */
export function AccessLogPanel({ patientId }: { patientId: string }) {
  const [entries, setEntries] = useState<AccessLogEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      try {
        const q = new URLSearchParams({ patientId, limit: String(PAGE) });
        if (before) q.set("before", before);
        const page = await api<AccessLogEntry[]>(`access-log?${q}`);
        setEntries((prev) => (before ? [...(prev ?? []), ...page] : page));
        setMore(page.length === PAGE);
        setErr(null);
      } catch (e) {
        setErr(errorMessage(e));
      }
    },
    [patientId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visits = entries ? toVisits(entries) : [];

  return (
    <Card>
      <SectionHeading>Quién vio esta ficha</SectionHeading>
      <p className="mt-1 text-sm text-stone-500">
        Cada vez que alguien del equipo abre datos de este deportista queda registrado. Sólo lo ve la administración.
      </p>
      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
      {entries === null && !err ? (
        <div className="mt-4">
          <Loading />
        </div>
      ) : visits.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">Todavía nadie del equipo abrió sus datos.</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {visits.map((v) => (
            <li key={v.key} className="rounded-lg border border-stone-100 px-3 py-2 text-sm">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-stone-900">
                  {v.actor} <span className="font-normal text-stone-500">· {v.role}</span>
                </span>
                <time dateTime={v.at.toISOString()} className="font-display tabular-nums text-stone-500">
                  {when(v.at)}
                </time>
              </p>
              <p className="mt-0.5 text-stone-600">{v.resources.map((r) => ACCESS_RESOURCE_LABEL[r]).join(", ")}</p>
            </li>
          ))}
        </ol>
      )}
      {more && entries && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => load(entries[entries.length - 1]!.createdAt)}>
          Ver anteriores
        </Button>
      )}
    </Card>
  );
}
