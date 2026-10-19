"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ConversationRefDto, InboxEntryDto } from "@nutreitor/shared";

import { Alert, cn, EmptyState, Loading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { ChatThread } from "./chat-thread";
import { MESSAGES_READ_EVENT } from "./use-unread";

type Audience = "professional" | "admin" | "patient";

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return new Date().toDateString() === d.toDateString()
    ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
};

const EMPTY: Record<Audience, string> = {
  professional:
    "Todavía no hay conversaciones con pacientes. Escribiles desde la pestaña Mensajes de su ficha; acá también está tu canal con la administración.",
  admin: "Todavía no hay profesionales activos en el consultorio.",
  patient: "Vas a poder escribir cuando tengas un profesional asignado.",
};

/**
 * Bandeja de conversaciones privadas (ADR 0024) en dos paneles: lista + conversación
 * abierta (`?c=` en la URL). En celular, una cosa por vez. Una fila sin
 * conversación todavía (ej. un profesional al que la admin nunca escribió) la crea
 * al abrirla.
 */
/** `solo`: independiente (ADR 0026), sin canal con la administración. */
export function Conversations({ audience, solo = false }: { audience: Audience; solo?: boolean }) {
  const base = audience === "patient" ? "portal/me/conversations" : "conversations";
  const router = useRouter();
  const pathname = usePathname();
  const selected = useSearchParams().get("c");
  const [entries, setEntries] = useState<InboxEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<InboxEntryDto[]>(base)
      .then(setEntries)
      .catch((e) => setError(errorMessage(e)));
  }, [base]);
  useEffect(() => {
    load();
    window.addEventListener(MESSAGES_READ_EVENT, load);
    return () => window.removeEventListener(MESSAGES_READ_EVENT, load);
  }, [load]);

  const select = (id: string | null) =>
    router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });

  // Paciente con un solo profesional: directo a la conversación.
  useEffect(() => {
    if (audience === "patient" && !selected && entries?.length === 1) void open(entries[0]!);
  }, [entries, selected, audience]);

  async function open(e: InboxEntryDto) {
    if (e.conversationId) return select(e.conversationId);
    const path =
      audience === "professional"
        ? "conversations/admin"
        : `${base}/professional/${e.professionalMembershipId}`;
    try {
      const { conversationId } = await api<ConversationRefDto>(path, { method: "POST" });
      load();
      select(conversationId);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!entries) return <Loading />;
  if (!entries.length) {
    return (
      <EmptyState>
        {solo
          ? "Todavía no hay conversaciones con pacientes. Escribiles desde la pestaña Mensajes de su ficha."
          : EMPTY[audience]}
      </EmptyState>
    );
  }

  const current = entries.find((e) => e.conversationId === selected);
  return (
    <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
      <ul
        className={cn(
          "divide-y divide-stone-100 self-start rounded-2xl border border-stone-200 bg-white shadow-sm",
          selected && "hidden md:block",
        )}
      >
        {entries.map((e) => (
          <li key={e.conversationId ?? `${e.kind}:${e.professionalMembershipId}`}>
            <button
              type="button"
              onClick={() => void open(e)}
              aria-current={e.conversationId === selected ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50",
                e.conversationId === selected && "bg-brand/5",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={e.unread ? "font-semibold text-stone-900" : "font-medium text-stone-800"}>{e.title}</span>
                  {e.lastMessage && (
                    <span className="shrink-0 text-xs text-stone-500">{fmtWhen(e.lastMessage.createdAt)}</span>
                  )}
                </div>
                <p className={cn("truncate text-sm", e.unread ? "text-stone-800" : "text-stone-500")}>
                  {e.lastMessage ? `${e.lastMessage.mine ? "Vos: " : ""}${e.lastMessage.body}` : "Sin mensajes todavía"}
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
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => select(null)}
              className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800 md:hidden"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Conversaciones
            </button>
            {current && <h2 className="font-medium text-stone-900 max-md:hidden">{current.title}</h2>}
          </div>
          <ChatThread
            key={selected}
            endpoint={`${base}/${selected}`}
            emptyText="Todavía no hay mensajes. Escribí el primero."
            blockedText="Esta conversación quedó cerrada (ya no hay una asignación activa)."
          />
        </div>
      ) : (
        <p className="hidden self-center text-center text-sm text-stone-500 md:block">Elegí una conversación.</p>
      )}
    </div>
  );
}

/** Pestaña "Mensajes" de la ficha (sólo el profesional): su conversación con el paciente. */
export function PatientConversation({ patientId }: { patientId: string }) {
  const [id, setId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<ConversationRefDto>(`conversations/patient/${patientId}`, { method: "POST" })
      .then((r) => setId(r.conversationId))
      .catch((e) => setError(errorMessage(e)));
  }, [patientId]);
  if (error) return <Alert>{error}</Alert>;
  if (!id) return <Loading />;
  return (
    <ChatThread
      endpoint={`conversations/${id}`}
      emptyText="Todavía no hay mensajes. Lo que escribas lo ve sólo este paciente (ni la administración ni otros profesionales)."
      blockedText="Esta conversación quedó cerrada."
    />
  );
}
