"use client";

import { useCallback, useEffect, useState } from "react";
import type { MembershipRole, ThreadDto, UnreadDto } from "@nutreitor/shared";

import { api } from "@/lib/api";

/** Evento que dispara una conversación al marcarse como leída (refresca el contador). */
export const MESSAGES_READ_EVENT = "messages:read";

const POLL_MS = 60_000;

/**
 * No leídos para el badge de "Mensajes". Equipo: suma de la bandeja. Paciente: la
 * propia conversación pedida desde "ahora" (sin mensajes, sólo el contador).
 */
export function useUnreadMessages(role: MembershipRole): number {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async (force = false) => {
    if (!force && document.visibilityState !== "visible") return;
    try {
      if (role === "patient") {
        const t = await api<ThreadDto>(`portal/me/messages?after=${encodeURIComponent(new Date().toISOString())}`);
        setCount(t.unread);
      } else {
        setCount((await api<UnreadDto>("messages/unread")).total);
      }
    } catch {
      /* el badge es accesorio: si falla, queda el último valor */
    }
  }, [role]);

  useEffect(() => {
    void refresh(true);
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onRead = () => void refresh(true);
    const onVisible = () => void refresh();
    window.addEventListener(MESSAGES_READ_EVENT, onRead);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(MESSAGES_READ_EVENT, onRead);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  return count;
}
