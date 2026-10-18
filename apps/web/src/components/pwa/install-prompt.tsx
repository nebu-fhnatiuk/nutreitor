"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, cn } from "@/components/ui";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "pwa-install-dismissed";

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Invitación a instalar el portal como app. En Android/Chrome usa el diálogo nativo
 * (`beforeinstallprompt`); en iPhone explica "Compartir → Agregar a inicio". No se
 * muestra si ya está instalada o si la persona la cerró.
 */
export function InstallPrompt({ appName, className }: { appName: string; className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || dismissed()) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIos(isIos);
    if (isIos) setHidden(false);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sin storage: se vuelve a ofrecer la próxima vez */
    }
  };

  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border border-brand/20 bg-brand/5 p-4", className)}>
      <Download className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-stone-900">Tené {appName} en tu celular</p>
        {ios ? (
          <p className="mt-1 text-stone-600">
            Tocá <Share className="inline h-4 w-4 align-text-bottom" aria-label="Compartir" /> y después
            “Agregar a inicio”: queda como una app, a un toque.
          </p>
        ) : (
          <>
            <p className="mt-1 text-stone-600">Instalala como app para registrar tus comidas a un toque.</p>
            <Button
              size="sm"
              className="mt-3"
              onClick={async () => {
                await deferred?.prompt();
                const choice = await deferred?.userChoice;
                if (choice?.outcome === "accepted") close();
                setDeferred(null);
              }}
            >
              Instalar
            </Button>
          </>
        )}
      </div>
      <button type="button" onClick={close} aria-label="No mostrar más" className="text-stone-400 hover:text-stone-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
