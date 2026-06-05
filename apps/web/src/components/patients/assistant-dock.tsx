"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentChatResponse } from "@nutreitor/shared";

import { api } from "@/lib/api";

type Msg = { role: "user" | "assistant"; content: string };
type AgentKey = "nutri";
type Thread = { messages: Msg[]; conversationId?: string };

// NUTRI es el único agente del lado del PROFESIONAL. CHEF y PSICO miran al paciente
// y viven en el portal (ver ADR 0015 y components/portal/portal-assistant.tsx).
const AGENTS: {
  key: AgentKey;
  label: string;
  blurb: string;
  placeholder: string;
  suggestions: string[];
}[] = [
  {
    key: "nutri",
    label: "NUTRI",
    blurb: "Asiste sobre la evolución del paciente e ideas de ajuste del plan.",
    placeholder: "Ej.: ¿cómo viene la evolución y qué ajusto?",
    suggestions: ["¿Cómo viene la evolución?", "¿Qué ajusto del plan actual?"],
  },
];

const inputCls =
  "flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

/**
 * Dock flotante de asistentes (NUTRI / CHEF) sobre un paciente. Botón siempre
 * visible abajo-derecha → abre un panel lateral con tabs por agente. Cada agente
 * mantiene su propio hilo. Cliente fino del gateway `/agents/chat`: el servicio
 * responde con el contexto clínico (bajo RLS). El output es un BORRADOR a revisar;
 * nunca se aplica solo.
 */
export function AssistantDock({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState<AgentKey>("nutri");
  const [threads, setThreads] = useState<Record<AgentKey, Thread>>({
    nutri: { messages: [] },
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const meta = AGENTS.find((a) => a.key === agent)!;
  const thread = threads[agent];

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setError(null);
    setBusy(true);
    setInput("");
    setThreads((t) => ({
      ...t,
      [agent]: { ...t[agent], messages: [...t[agent].messages, { role: "user", content: msg }] },
    }));
    try {
      const res = await api<AgentChatResponse>("agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent,
          patientId,
          conversationId: threads[agent].conversationId,
          message: msg,
        }),
      });
      setThreads((t) => ({
        ...t,
        [agent]: {
          conversationId: res.conversationId,
          messages: [...t[agent].messages, { role: "assistant", content: res.reply }],
        },
      }));
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Lanzador flotante — siempre visible mientras se ve la ficha. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir asistentes"
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-medium text-brand-fg shadow-lg shadow-brand/20 transition hover:brightness-110"
        >
          <span aria-hidden>✨</span>
          Asistentes
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Scrim */}
          <button
            aria-label="Cerrar asistentes"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-stone-900/20"
          />
          {/* Panel */}
          <aside
            role="dialog"
            aria-label="Asistentes del paciente"
            className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-stone-800">Asistentes</h2>
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand">
                  borrador · revisá vos
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              >
                ✕
              </button>
            </header>

            {/* Tabs por agente (se ocultan si hay uno solo) */}
            <div className={AGENTS.length > 1 ? "flex gap-1 border-b border-stone-200 px-3 pt-3" : "hidden"}>
              {AGENTS.map((a) => {
                const active = a.key === agent;
                return (
                  <button
                    key={a.key}
                    onClick={() => {
                      setAgent(a.key);
                      setError(null);
                    }}
                    role="tab"
                    aria-selected={active}
                    className={
                      "rounded-t-lg px-4 py-2 text-sm font-medium transition " +
                      (active
                        ? "border-b-2 border-brand text-brand"
                        : "text-stone-500 hover:text-stone-800")
                    }
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>

            {/* Cuerpo del chat */}
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <p className="text-sm text-stone-500">{meta.blurb}</p>

              {thread.messages.length === 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {meta.suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => void send(s)}
                      disabled={busy}
                      className="rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-600 transition hover:border-brand/40 hover:text-brand disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {thread.messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      "max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm " +
                      (m.role === "user"
                        ? "bg-brand/10 text-stone-800"
                        : "border border-stone-200 bg-stone-50 text-stone-700")
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {busy && <p className="text-sm text-stone-400">{meta.label} está pensando…</p>}
              <div ref={endRef} />
            </div>

            {error && (
              <div className="mx-5 mb-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex gap-2 border-t border-stone-200 px-5 py-4"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={meta.placeholder}
                className={inputCls}
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="shrink-0 rounded-lg bg-brand px-5 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
