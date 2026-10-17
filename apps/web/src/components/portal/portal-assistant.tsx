"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentChatResponse, AgentConsentDto } from "@nutreitor/shared";

import { Alert, Button, Input, SlideOver } from "@/components/ui";
import { api } from "@/lib/api";

type Msg = { role: "user" | "assistant"; content: string; crisis?: boolean };
type AgentKey = "chef" | "psico";
type Thread = { messages: Msg[]; conversationId?: string };

const AGENTS: {
  key: AgentKey;
  label: string;
  blurb: string;
  placeholder: string;
  suggestions: string[];
}[] = [
  {
    key: "chef",
    label: "CHEF",
    blurb: "Ideas de recetas a partir de tu plan, respetando lo que no te cae bien.",
    placeholder: "Ej.: ¿qué puedo cocinar para el almuerzo?",
    suggestions: ["¿Qué cocino hoy con mi plan?", "Ideas rápidas para la cena"],
  },
  {
    key: "psico",
    label: "PSICO",
    blurb:
      "Un espacio para hablar de cómo venís con la comida y el tratamiento. No es terapia ni un servicio de emergencia.",
    placeholder: "Contame cómo venís…",
    suggestions: ["Me cuesta seguir el plan", "Me siento ansioso/a con la comida"],
  },
];

/**
 * Asistentes del PACIENTE en el portal (CHEF / PSICO) — ver ADR 0015. Botón flotante
 * → panel con consentimiento previo (opt-in), tabs por agente, y manejo de crisis de
 * PSICO (la respuesta de contención se resalta con recursos de emergencia). El back
 * resuelve "mi ficha"; PSICO sólo se habilita con profesional asignado.
 */
export function PortalAssistant({
  hasAssignedProfessional,
}: {
  hasAssignedProfessional: boolean;
}) {
  // PSICO es supervisado: sólo se ofrece si hay profesional asignado (el back igual
  // lo exige). CHEF está siempre.
  const agents = hasAssignedProfessional ? AGENTS : AGENTS.filter((a) => a.key !== "psico");
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState<AgentConsentDto | null>(null);
  const [agent, setAgent] = useState<AgentKey>("chef");
  const [threads, setThreads] = useState<Record<AgentKey, Thread>>({
    chef: { messages: [] },
    psico: { messages: [] },
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const meta = AGENTS.find((a) => a.key === agent)!;
  const thread = threads[agent];

  useEffect(() => {
    if (!open || consent) return;
    void api<AgentConsentDto>("portal/agents/consent")
      .then(setConsent)
      .catch((e) => setError(String(e)));
  }, [open, consent]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      setConsent(await api<AgentConsentDto>("portal/agents/consent", { method: "POST" }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

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
      const res = await api<AgentChatResponse>("portal/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, conversationId: threads[agent].conversationId, message: msg }),
      });
      setThreads((t) => ({
        ...t,
        [agent]: {
          conversationId: res.conversationId,
          messages: [
            ...t[agent].messages,
            { role: "assistant", content: res.reply, crisis: res.crisis },
          ],
        },
      }));
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const accepted = consent?.accepted === true;

  return (
    <>
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

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        header={<h2 className="text-sm font-semibold text-stone-800">Asistentes</h2>}
      >
        {!accepted ? (
          <ConsentGate busy={busy} error={error} onAccept={accept} />
        ) : (
          <>
            <div className="flex gap-1 border-b border-stone-200 px-3 pt-3">
              {agents.map((a) => {
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

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <p className="text-sm text-stone-500">{meta.blurb}</p>
              {agent === "psico" && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Si estás en peligro o pensás en hacerte daño, llamá al <b>135</b> o al{" "}
                  <b>911</b>. Tu profesional puede ver estas conversaciones.
                </p>
              )}

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
                        : m.crisis
                          ? "border border-red-200 bg-red-50 text-red-800"
                          : "border border-stone-200 bg-stone-50 text-stone-700")
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {busy && <p className="text-sm text-stone-500">{meta.label} está pensando…</p>}
              <div ref={endRef} />
            </div>

            {error && <Alert className="mx-5 mb-2">{error}</Alert>}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex gap-2 border-t border-stone-200 px-5 py-4"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={meta.placeholder}
                className="flex-1"
              />
              <Button type="submit" disabled={busy || !input.trim()} className="shrink-0">
                Enviar
              </Button>
            </form>
          </>
        )}
      </SlideOver>
    </>
  );
}

/** Pantalla de consentimiento informado previa al primer uso (opt-in registrado). */
function ConsentGate({
  busy,
  error,
  onAccept,
}: {
  busy: boolean;
  error: string | null;
  onAccept: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-6">
      <h3 className="font-serif text-xl text-stone-900">Antes de empezar</h3>
      <div className="space-y-3 text-sm text-stone-600">
        <p>
          <b>CHEF</b> y <b>PSICO</b> son asistentes con inteligencia artificial pensados
          para acompañarte: ideas de cocina según tu plan y un espacio para hablar de
          cómo venís.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>No reemplazan a tu profesional ni son un servicio de emergencia.</li>
          <li>
            Lo que escribas se procesa para darte respuestas y <b>tu profesional puede
            verlo</b> para acompañarte mejor.
          </li>
          <li>PSICO está disponible cuando tenés un profesional asignado.</li>
          <li>
            Si estás en peligro, llamá al <b>135</b> (Centro de Asistencia al Suicida) o
            al <b>911</b>.
          </li>
        </ul>
        <p>Al continuar, aceptás el uso de estos asistentes en estas condiciones.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <Button onClick={onAccept} disabled={busy} className="mt-auto">
        {busy ? "Guardando…" : "Acepto y continúo"}
      </Button>
    </div>
  );
}
