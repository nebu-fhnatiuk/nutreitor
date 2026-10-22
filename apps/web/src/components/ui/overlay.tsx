"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "./cn";

/** Cierra con Escape mientras el overlay está abierto. */
function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

/**
 * Los overlays se montan en <body> (portal): renderizados en su lugar heredaban
 * estilos del contenedor — p. ej. `space-y-*` le sumaba margin-top a un `fixed
 * inset-0` y el panel arrancaba 24 px más abajo, dejando una franja sin cubrir.
 * Dentro del workspace se montan en la raíz del tema (no en <body>) para heredar
 * las variables del tema Estadio.
 */
function Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  const root = document.querySelector<HTMLElement>("[data-theme]") ?? document.body;
  return createPortal(children, root);
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Cerrar"
      className="rounded-lg p-1 text-stone-500 transition hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}

/**
 * Diálogo modal centrado (en mobile sube como bottom-sheet). Unifica los overlays
 * hechos a mano (agenda, reprogramar) con scrim + Escape + foco. El branding se
 * mantiene (sin colores hardcodeados fuera de los neutros del scrim).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
        <button aria-label="Cerrar" onClick={onClose} className="absolute inset-0 cursor-default" />
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            // Alto máximo + scroll propio: un formulario largo no queda fuera de la pantalla.
            "relative max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-stone-200 bg-surface p-5 shadow-xl sm:rounded-2xl",
            className,
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            {title ? (
              <h3 className="font-serif text-lg font-medium text-stone-900">{title}</h3>
            ) : (
              <span />
            )}
            <CloseButton onClose={onClose} />
          </div>
          {children}
        </div>
      </div>
    </Portal>
  );
}

/**
 * Panel lateral (slide-over) a la derecha, alto completo. Unifica los docks de chat.
 * El contenido (tabs, etc.) lo arma el caller; acá van el scrim, Escape y el shell.
 */
export function SlideOver({
  open,
  onClose,
  header,
  children,
  className,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Panel ancho (formularios con varias columnas, p. ej. horarios de atención). */
  wide?: boolean;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex justify-end">
        <button aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/30" />
        <aside
          role="dialog"
          aria-modal="true"
          className={cn(
            "relative flex h-full w-full flex-col bg-surface shadow-2xl",
            wide ? "max-w-2xl" : "max-w-md",
            className,
          )}
        >
          <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
            <div className="min-w-0">{header}</div>
            <CloseButton onClose={onClose} />
          </header>
          {children}
        </aside>
      </div>
    </Portal>
  );
}
