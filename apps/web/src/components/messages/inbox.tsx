"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { InboxEntryDto } from "@nutreitor/shared";

import { Alert, EmptyState, Loading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return new Date().toDateString() === d.toDateString()
    ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
};

/** Bandeja del equipo: conversaciones con pacientes, la más reciente primero. */
export function Inbox({ patientBase }: { patientBase: string }) {
  const [entries, setEntries] = useState<InboxEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<InboxEntryDto[]>("messages/inbox")
      .then(setEntries)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!entries) return <Loading />;
  if (!entries.length) {
    return (
      <EmptyState>
        Todavía no hay mensajes. Tus pacientes te escriben desde su portal, y vos podés
        escribirles desde la pestaña Mensajes de su ficha.
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white shadow-sm">
      {entries.map((e) => (
        <li key={e.patientId}>
          <Link
            href={`${patientBase}/${e.patientId}?tab=mensajes`}
            className="flex items-center gap-3 px-4 py-3 transition hover:bg-stone-50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className={e.unread ? "font-semibold text-stone-900" : "font-medium text-stone-800"}>
                  {e.patientName}
                </span>
                <span className="shrink-0 text-xs text-stone-500">{fmtWhen(e.lastMessage.createdAt)}</span>
              </div>
              <p className={`truncate text-sm ${e.unread ? "text-stone-800" : "text-stone-500"}`}>
                {e.lastMessage.fromPatient ? "" : "Equipo: "}
                {e.lastMessage.body}
              </p>
            </div>
            {e.unread > 0 && (
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-medium text-brand-fg"
                aria-label={`${e.unread} sin leer`}
              >
                {e.unread}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
