"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AgentConversationDetailDto,
  AgentConversationSummaryDto,
} from "@nutreitor/shared";

import { api } from "@/lib/api";
import { Button, Card, EmptyState, Loading, SectionHeading } from "@/components/ui";

const AGENT_LABEL: Record<string, string> = { nutri: "NUTRI", chef: "CHEF", psico: "PSICO" };
/** Charlas por página: con decenas de charlas la lista tapaba la ficha entera. */
const PAGE = 8;

/**
 * Supervisión (lado profesional): las charlas del paciente con los asistentes del
 * portal (CHEF/PSICO). PSICO es supervisado — una crisis detectada queda marcada acá
 * para que el profesional asignado pueda acompañar. Ver ADR 0015.
 */
export function AgentConversations({ patientId }: { patientId: string }) {
  const [list, setList] = useState<AgentConversationSummaryDto[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentConversationDetailDto | null>(null);
  const [shown, setShown] = useState(PAGE);

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

  if (list === null) return <Loading />;
  if (list.length === 0) {
    return (
      <Card>
        <EmptyState>El paciente todavía no habló con los asistentes.</EmptyState>
      </Card>
    );
  }
  // Las charlas con crisis van primero: son las que el profesional tiene que revisar.
  const sorted = [...list].sort((a, b) => Number(b.crisis) - Number(a.crisis));
  const crisisCount = list.filter((c) => c.crisis).length;

  return (
    <Card>
      <SectionHeading className="mb-1">Charlas con asistentes</SectionHeading>
      <p className="mb-4 text-sm text-stone-500">
        {list.length} {list.length === 1 ? "charla" : "charlas"}
        {crisisCount > 0 && ` · ${crisisCount} para revisar (aparecen primero)`}
      </p>
      <ul className="space-y-2">
        {sorted.slice(0, shown).map((c) => (
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
                <div className="text-xs text-stone-500">
                  {new Date(c.createdAt).toLocaleDateString("es-AR")} · {c.messageCount} mensajes
                </div>
              </div>
              <span className="shrink-0 text-xs text-stone-500">{openId === c.id ? "Ocultar" : "Ver"}</span>
            </button>

            {openId === c.id && (
              <div className="space-y-2 border-t border-stone-100 px-3 py-3">
                {!detail ? (
                  <Loading />
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
      {shown < sorted.length && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => setShown((n) => n + PAGE)}>
          Ver {Math.min(PAGE, sorted.length - shown)} más
        </Button>
      )}
    </Card>
  );
}
