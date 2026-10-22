"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "./button";
import { cn } from "./cn";
import { Modal } from "./overlay";

type ToastTone = "success" | "error";
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger": la acción no se puede deshacer o tiene consecuencias. */
  tone?: "danger" | "default";
}

interface FeedbackApi {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

/**
 * Feedback transversal del workspace: avisos efímeros ("Plan guardado") y
 * confirmación antes de acciones destructivas (archivar, cancelar, dar de baja).
 * Antes no había ni lo uno ni lo otro: se guardaba sin confirmación visible y se
 * archivaba un plan con un solo clic.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const seq = useRef(0);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setPending(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function close(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  }

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm shadow-lg",
              t.tone === "success" ? "bg-stone-900 text-stone-50" : "bg-red-600 text-white",
            )}
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" aria-hidden />
            )}
            {t.message}
          </div>
        ))}
      </div>

      <Modal open={pending !== null} onClose={() => close(false)} title={pending?.title}>
        {pending?.body && <div className="mb-5 text-sm text-stone-600">{pending.body}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          {/* En una acción peligrosa el foco arranca en "Volver": un Enter apurado no borra. */}
          <Button variant="ghost" autoFocus={pending?.tone === "danger"} onClick={() => close(false)}>
            {pending?.cancelLabel ?? "Volver"}
          </Button>
          <Button
            autoFocus={pending?.tone !== "danger"}
            variant={pending?.tone === "danger" ? "destructive" : "primary"}
            onClick={() => close(true)}
          >
            {pending?.confirmLabel ?? "Confirmar"}
          </Button>
        </div>
      </Modal>
    </FeedbackContext.Provider>
  );
}

/**
 * Avisos + confirmación. Fuera del provider (pantallas sin shell, como la reserva
 * pública) no rompe: el aviso no se muestra y la confirmación usa la del navegador.
 */
export function useFeedback(): FeedbackApi {
  return (
    useContext(FeedbackContext) ?? {
      toast: () => {},
      confirm: async (o) => window.confirm(o.title),
    }
  );
}
