"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AgentConversationDetailDto,
  AgentConversationSummaryDto,
} from "@nutreitor/shared";

import { api } from "@/lib/api";

const AGENT_LABEL: Record<string, string> = { nutri: "NUTRI", chef: "CHEF", psico: "PSICO" };

/**
 * Supervisión (lado profesional): las charlas del paciente con los asistentes del
 * portal (CHEF/PSICO). PSICO es supervisado — una crisis detectada queda marcada acá
 * para que el profesional asignado pueda acompañar. Ver ADR 0015.
 */
export function AgentConversations({ patientId }: { patientId: string }) {
  const [list, setList] = useState<AgentConversationSummaryDto[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentConversationDetailDto | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api<AgentConversationSummaryDto[]>(`agents/conversations?patientId=${patientId}`));
    } catch {
      setList([]);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    try {
      setDetail(await api<AgentConversationDetailDto>(`agents/conversations/${id}`));
    } catch {
      setDetail(null);
    }
  }

  if (!list || list.length === 0) return null;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
        Charlas con asistentes
      </h2>
      <ul className="space-y-2">
        {list.map((c) => (
          <li key={c.id} className="rounded-lg border border-stone-100">
            <button
              onClick={() => void toggle(c.id)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-stone-800">
                  {AGENT_LABEL[c.agent] ?? c.agent}
                  {c.crisis && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                      crisis · revisar
                    </span>
                  )}
                </div>
                <div className="text-xs text-stone-400">
                  {new Date(c.createdAt).toLocaleDateString("es-AR")} · {c.messageCount} mensajes
                </div>
              </div>
              <span className="shrink-0 text-xs text-stone-400">{openId === c.id ? "Ocultar" : "Ver"}</span>
            </button>

            {openId === c.id && (
              <div className="space-y-2 border-t border-stone-100 px-3 py-3">
                {!detail ? (
                  <p className="text-sm text-stone-400">Cargando…</p>
                ) : (
                  detail.messages.map((m) => (
                    <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={
                          "max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-1.5 text-sm " +
                          (m.role === "user"
                            ? "bg-brand/10 text-stone-800"
                            : "border border-stone-200 bg-stone-50 text-stone-700")
                        }
                      >
                        {m.content}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
