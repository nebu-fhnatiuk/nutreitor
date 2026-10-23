"use client";

import { ChevronLeft, ChevronRight, Delete, Mic, MicOff, Sun, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { parseSpokenMeasure, type SpokenTarget } from "@nutreitor/shared";

import { cn } from "@/components/ui";

/** Una celda a cargar: un sitio (o campo) de un deportista, en una toma. */
export interface FieldStep {
  id: string;
  /** Deportista (o grupo de campos) al que pertenece. */
  who: string;
  /** Clave del sitio dentro del deportista: el dictado salta por ella. */
  key: string;
  label: string;
  unit: string;
  /** "Toma 2", "Pasada 1"… */
  sub?: string;
  value: string;
  min?: number;
  max?: number;
  /** Debajo del número: tomas anteriores, diferencia, plan… */
  hint?: ReactNode;
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function makeRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "back"] as const;

/**
 * Modo cancha (KAN-74): carga en el campo, un sitio por vez. Pantalla completa,
 * número enorme, botones de 64 px para una mano y alto contraste (con "modo sol":
 * fondo blanco, para leer con el sol de frente). El dictado usa el reconocimiento
 * de voz del navegador en español; si el navegador no lo tiene, queda el teclado.
 * No guarda nada: escribe en el mismo borrador que la planilla que lo abrió.
 */
export function FieldMode({
  title,
  steps,
  targets,
  start = 0,
  onChange,
  onClose,
}: {
  title: string;
  steps: FieldStep[];
  /** Sitios que se pueden nombrar por voz (por `key`). */
  targets: SpokenTarget[];
  start?: number;
  onChange: (stepId: string, value: string) => void;
  onClose: (lastIndex: number) => void;
}) {
  const [i, setI] = useState(() => Math.min(Math.max(start, 0), Math.max(steps.length - 1, 0)));
  const [sun, setSun] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const [voiceOk, setVoiceOk] = useState(false);
  useEffect(() => setVoiceOk(makeRecognition() !== null), []);

  const step = steps[i];
  const last = steps.length - 1;
  const go = useCallback((n: number) => setI(Math.min(Math.max(n, 0), last)), [last]);

  const n = step ? Number(step.value.replace(",", ".")) : NaN;
  const outOfRange = !!step && step.value !== "" && (Number.isNaN(n) || (step.min != null && n < step.min) || (step.max != null && n > step.max));

  const press = useCallback(
    (k: (typeof KEYS)[number]) => {
      if (!step) return;
      const v = step.value;
      if (k === "back") onChange(step.id, v.slice(0, -1));
      else if (k === ",") {
        if (!v.includes(",")) onChange(step.id, v === "" ? "0," : `${v},`);
      } else if (v.replace(",", "").length < 5) onChange(step.id, v + k);
    },
    [step, onChange],
  );

  /** Aplica lo dictado: con sitio, va a ese sitio del mismo deportista; sin sitio, al actual. */
  const applySpoken = useCallback(
    (text: string) => {
      const m = parseSpokenMeasure(text, targets);
      setHeard(text);
      if (m.value === null) {
        setVoiceErr("No entendí el número. Probá de nuevo o usá el teclado.");
        return;
      }
      setVoiceErr(null);
      const cur = steps[i];
      if (!cur) return;
      let idx = i;
      if (m.key && m.key !== cur.key) {
        const j = steps.findIndex((s, k) => k >= i && s.who === cur.who && s.key === m.key);
        const back = steps.findIndex((s) => s.who === cur.who && s.key === m.key);
        idx = j !== -1 ? j : back;
        if (idx === -1) {
          setVoiceErr("Ese sitio no está en esta pasada.");
          return;
        }
      }
      onChange(steps[idx]!.id, String(m.value).replace(".", ","));
      go(idx + 1 <= last ? idx + 1 : idx);
    },
    [targets, steps, i, onChange, go, last],
  );

  function toggleMic() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = makeRecognition();
    if (!r) return;
    r.lang = "es-AR";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const res = e.results[e.results.length - 1]!;
      const text = res[0]!.transcript;
      if (res.isFinal) applySpoken(text);
      else setHeard(text);
    };
    r.onerror = (e) => {
      setVoiceErr(e.error === "not-allowed" ? "Sin permiso para usar el micrófono." : "No se pudo escuchar. Probá de nuevo.");
      setListening(false);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setVoiceErr(null);
    setHeard(null);
    setListening(true);
    r.start();
  }

  // Teclado físico (tablet con teclado, o para probar en la compu).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") press(e.key as (typeof KEYS)[number]);
      else if (e.key === "," || e.key === ".") press(",");
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter" || e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else if (e.key === "Escape") onClose(i);
      else return;
      // En captura y sin propagar: el modal o la planilla de atrás no reciben la tecla.
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [press, go, i, onClose]);

  useEffect(() => () => rec.current?.stop(), []);

  if (typeof document === "undefined") return null;
  const next = steps[i + 1];
  const pct = steps.length ? Math.round(((i + 1) / steps.length) * 100) : 0;

  const ui = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Modo cancha: ${title}`}
      className={cn(
        "fixed inset-0 z-[60] flex flex-col overflow-y-auto font-sans",
        sun ? "bg-white text-black" : "bg-black text-white",
      )}
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col px-4 pb-4 pt-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onClose(i)}
            className="flex min-h-12 items-center gap-1.5 font-display text-base font-semibold uppercase tracking-wider"
          >
            <X className="h-6 w-6" aria-hidden /> Salir
          </button>
          <span className={cn("truncate font-display text-sm font-semibold uppercase tracking-wider", sun ? "text-black" : "text-accent2")}>{title}</span>
          <button
            type="button"
            onClick={() => setSun((s) => !s)}
            aria-pressed={sun}
            className="flex min-h-12 items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-wider"
          >
            <Sun className="h-5 w-5" aria-hidden /> Sol
          </button>
        </div>

        {!step ? (
          <p className="mt-10 text-center text-lg">No hay nada para cargar en esta pasada.</p>
        ) : (
          <>
            <div className="mt-3">
              <p className="truncate font-display text-3xl font-extrabold uppercase leading-none sm:text-4xl">{step.who}</p>
              <p className={cn("mt-1 font-display text-sm font-semibold uppercase tracking-wider", sun ? "text-neutral-700" : "text-neutral-300")}>
                {step.sub ? `${step.sub} · ` : ""}Paso {i + 1} de {steps.length}
              </p>
            </div>
            <div className={cn("mt-3 h-2 rounded-full", sun ? "bg-neutral-200" : "bg-neutral-800")} aria-hidden>
              <div className={cn("h-2 rounded-full", sun ? "bg-black" : "bg-accent2")} style={{ width: `${pct}%` }} />
            </div>

            <section
              aria-live="polite"
              className={cn("mt-4 rounded-3xl border-2 px-4 py-3 text-center", sun ? "border-black" : "border-neutral-700 bg-neutral-950")}
            >
              <p className="font-display text-2xl font-bold uppercase">{step.label}</p>
              <p className={cn("mt-1 font-display text-[5.5rem] font-extrabold leading-none tabular-nums sm:text-[7rem]", outOfRange && (sun ? "text-[#B91C1C]" : "text-[#F87171]"))}>
                {step.value || "—"}
              </p>
              <p className={cn("font-display text-xl font-semibold uppercase", sun ? "text-neutral-700" : "text-neutral-300")}>{step.unit}</p>
              {outOfRange && (
                <p className="mt-2 font-display text-lg font-bold uppercase">
                  Fuera de rango ({step.min}–{step.max})
                </p>
              )}
              {step.hint && <div className="mt-3 text-lg">{step.hint}</div>}
            </section>

            {!heard && !voiceErr && !listening && voiceOk && (
              <p className={cn("mt-2 text-center text-sm", sun ? "text-neutral-700" : "text-neutral-300")}>
                Tocá el micrófono y decí «tríceps doce coma cinco». El dictado lo hace tu navegador (en Chrome, con los
                servidores de Google): decí sólo el sitio y el número.
              </p>
            )}
            {(heard || voiceErr || listening) && (
              <p className={cn("mt-2 flex items-center gap-2 rounded-2xl border px-4 py-2 text-base", sun ? "border-black" : "border-neutral-700")}>
                {listening && <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-[#DC2626]" aria-hidden />}
                <span className="min-w-0 flex-1">{voiceErr ?? (heard ? `“${heard}”` : "Escuchando…")}</span>
              </p>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2">
              {KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => press(k)}
                  aria-label={k === "back" ? "Borrar" : k === "," ? "Coma" : k}
                  className={cn(
                    "flex min-h-14 items-center justify-center rounded-2xl font-display text-3xl font-bold active:scale-95",
                    sun ? "bg-neutral-100 text-black" : "bg-neutral-900 text-white",
                  )}
                >
                  {k === "back" ? <Delete className="h-7 w-7" aria-hidden /> : k}
                </button>
              ))}
            </div>

            <div className="mt-auto grid grid-cols-3 items-center gap-3 pt-3">
              <button
                type="button"
                onClick={() => go(i - 1)}
                disabled={i === 0}
                className={cn("flex min-h-16 items-center justify-center gap-1 rounded-2xl border-2 font-display text-lg font-bold uppercase disabled:opacity-30", sun ? "border-black" : "border-neutral-600")}
              >
                <ChevronLeft className="h-6 w-6" aria-hidden /> Anterior
              </button>
              <button
                type="button"
                onClick={toggleMic}
                disabled={!voiceOk}
                aria-pressed={listening}
                aria-label={voiceOk ? (listening ? "Dejar de escuchar" : "Dictar con la voz") : "Dictado no disponible en este navegador"}
                className={cn(
                  "mx-auto flex h-20 w-20 items-center justify-center rounded-full disabled:opacity-30",
                  listening ? "bg-[#DC2626] text-white" : sun ? "bg-black text-white" : "bg-accent2 text-accent2-fg",
                )}
              >
                {voiceOk ? <Mic className="h-10 w-10" aria-hidden /> : <MicOff className="h-10 w-10" aria-hidden />}
              </button>
              <button
                type="button"
                onClick={() => (i === last ? onClose(i) : go(i + 1))}
                className={cn("flex min-h-16 items-center justify-center gap-1 rounded-2xl font-display text-lg font-bold uppercase", sun ? "bg-black text-white" : "bg-white text-black")}
              >
                {i === last ? "Listo" : "Siguiente"} {i !== last && <ChevronRight className="h-6 w-6" aria-hidden />}
              </button>
            </div>
            <p className={cn("mt-2 text-center font-display text-sm font-semibold uppercase tracking-wider", sun ? "text-neutral-700" : "text-neutral-300")}>
              {next ? `Sigue: ${next.who === step.who ? "" : `${next.who} · `}${next.label}` : "Es el último"}
              {!voiceOk && " · Tu navegador no tiene dictado: usá el teclado"}
            </p>
          </>
        )}
      </div>
    </div>
  );
  // Dentro de la raíz del tema (hereda las vars del club); si no hay, en <body>.
  return createPortal(ui, document.querySelector<HTMLElement>("[data-theme]") ?? document.body);
}
