"use client";

import { useEffect } from "react";

/** Registra el service worker de la PWA (sin caché de datos; ver public/sw.js). */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
