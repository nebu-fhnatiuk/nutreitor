"use client";

import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { mergeMessages, MESSAGE_MAX_LENGTH, type MessageDto, type ThreadDto } from "@nutreitor/shared";

import { Alert, Button, cn, EmptyState, Loading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { MESSAGES_READ_EVENT } from "./use-unread";

/** Cada cuánto se buscan mensajes nuevos con la conversación abierta y visible. */
const POLL_MS = 10_000;

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/**
 * Conversación paciente ↔ equipo (Fase 4.3). Polling cada 10 s mientras está
 * abierta y la pestaña visible; marca como leído al ver mensajes ajenos. Enter
 * envía, Shift+Enter hace un salto de línea.
 */
export function ChatThread({
  endpoint,
  emptyText,
  blockedText,
}: {
  /** "conversations/{id}" (equipo) o "portal/me/conversations/{id}" (paciente). */
  endpoint: string;
  emptyText: string;
  /** Texto si no se puede escribir (paciente sin profesional asignado). */
  blockedText?: string;
}) {
  const [messages, setMessages] = useState<MessageDto[] | null>(null);
  const [canSend, setCanSend] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<string | null>(null);

  const markRead = useCallback(async () => {
    try {
      await api(`${endpoint}/read`, { method: "POST" });
      window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
    } catch {
      /* se reintenta en el próximo mensaje */
    }
  }, [endpoint]);

  const absorb = useCallback(
    (t: ThreadDto, opening = false) => {
      setCanSend(t.canSend);
      setMessages((cur) => {
        const next = mergeMessages(cur ?? [], t.messages);
        lastRef.current = next.at(-1)?.createdAt ?? null;
        return next;
      });
      // Al abrir, la persona la está viendo; en el polling, sólo si la pestaña está visible.
      if (t.unread > 0 && (opening || document.visibilityState === "visible")) void markRead();
    },
    [markRead],
  );

  useEffect(() => {
    let alive = true;
    api<ThreadDto>(`${endpoint}/messages`)
      .then((t) => alive && absorb(t, true))
      .catch((e) => alive && setError(errorMessage(e)));
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const after = lastRef.current ? `?after=${encodeURIComponent(lastRef.current)}` : "";
      api<ThreadDto>(`${endpoint}/messages${after}`)
        .then((t) => alive && absorb(t))
        .catch(() => {});
    }, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [endpoint, absorb]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const m = await api<MessageDto>(`${endpoint}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      setMessages((cur) => {
        const next = mergeMessages(cur ?? [], [m]);
        lastRef.current = next.at(-1)?.createdAt ?? null;
        return next;
      });
      setDraft("");
      // Escribir marca como leído en el servidor: que el contador se entere.
      window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (messages === null && !error) return <Loading />;

  return (
    <div className="flex flex-col rounded-2xl border border-stone-200 bg-surface shadow-sm">
      <div className="max-h-[60vh] min-h-[16rem] space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages?.length === 0 && <EmptyState>{emptyText}</EmptyState>}
        {messages?.map((m) => (
          <div key={m.id} className={cn("flex flex-col", m.mine ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
                m.mine ? "rounded-br-sm bg-brand text-brand-fg" : "rounded-bl-sm bg-stone-100 text-stone-800",
              )}
            >
              {m.body}
            </div>
            <span className="mt-0.5 px-1 text-[11px] text-stone-400">
              {m.mine ? "Vos" : m.author.name} · {fmtTime(m.createdAt)}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error && <Alert className="mx-4 mb-3">{error}</Alert>}
      {canSend ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2 border-t border-stone-100 p-3"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder="Escribí un mensaje…"
            aria-label="Mensaje"
            className="min-w-0 flex-1 resize-none rounded-lg border border-stone-200 bg-surface px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <Button type="submit" disabled={busy || !draft.trim()} aria-label="Enviar">
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </form>
      ) : (
        <p className="border-t border-stone-100 p-4 text-sm text-stone-500">{blockedText}</p>
      )}
    </div>
  );
}
