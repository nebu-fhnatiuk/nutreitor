"use client";

import { useRef, useState } from "react";
import type { AgentChatResponse } from "@nutreitor/shared";

import { api } from "@/lib/api";

type Msg = { role: "user" | "assistant"; content: string };

const inputCls =
  "flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

/**
 * Asistente NUTRI sobre un paciente. Cliente fino del gateway `/agents/chat`: el
 * pro pregunta, el servicio responde con el contexto clínico (bajo RLS). El output
 * es un BORRADOR para que el profesional revise; nunca se aplica solo.
 */
export function NutriAssistant({ patientId }: { patientId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    try {
      const res = await api<AgentChatResponse>("agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: "nutri", patientId, conversationId, message: text }),
      });
      setConversationId(res.conversationId);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          Asistente NUTRI
        </h2>
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand">borrador · revisá vos</span>
      </div>
      <p className="mb-4 text-sm text-stone-500">
        Preguntale sobre la evolución del paciente o ideas de ajuste del plan. Las
        sugerencias son un borrador: revisalas antes de aplicarlas.
      </p>

      {messages.length > 0 && (
        <div className="mb-4 max-h-96 space-y-3 overflow-y-auto">
          {messages.map((m, i) => (
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
          {busy && <p className="text-sm text-stone-400">NUTRI está pensando…</p>}
          <div ref={endRef} />
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={send} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ej.: ¿cómo viene la evolución y qué ajusto?"
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
    </section>
  );
}
