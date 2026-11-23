"use client";

import { useCallback, useEffect, useState } from "react";
import type { MembershipRole } from "@nutreitor/shared";

import { api } from "@/lib/api";

/** Evento que dispara la bandeja al responder una solicitud (refresca el contador). */
export const CONTACT_CHANGED_EVENT = "contact:changed";

const POLL_MS = 60_000;

/** Solicitudes nuevas para el badge de "Solicitudes" (no aplica al paciente ni al cuerpo técnico). */
export function useNewRequests(role: MembershipRole): number {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async (force = false) => {
    if (role === "patient" || role === "coach") return;
    if (!force && document.visibilityState !== "visible") return;
    try {
      setCount((await api<{ new: number }>("contact-requests/count")).new);
    } catch {
      /* accesorio: queda el último valor */
    }
  }, [role]);

  useEffect(() => {
    void refresh(true);
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onChanged = () => void refresh(true);
    window.addEventListener(CONTACT_CHANGED_EVENT, onChanged);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(CONTACT_CHANGED_EVENT, onChanged);
    };
  }, [refresh]);
  return count;
}
