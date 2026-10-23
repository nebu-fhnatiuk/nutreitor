"use client";

import { Download, Share2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { storyContent, type PatientReportDto, type StoryContent } from "@nutreitor/shared";

import { Button } from "@/components/ui";

const W = 1080;
const H = 1920;

interface Look {
  primary: string;
  primaryFg: string;
  accent: string;
  brandText: string;
  display: string;
  sans: string;
}

/** "16 122 87" de una variable CSS → "rgb(16 122 87)"; con respaldo si falta. */
function cssColor(style: CSSStyleDeclaration, name: string, fallback: string) {
  const v = style.getPropertyValue(name).trim();
  return v ? `rgb(${v})` : fallback;
}

/** Colores del club (variables del tenant, KAN-69) y las fuentes Estadio, leídos del DOM. */
function readLook(el: HTMLElement): Look {
  const s = getComputedStyle(el);
  const probe = (cls: string) => {
    const span = document.createElement("span");
    span.className = cls;
    el.appendChild(span);
    const f = getComputedStyle(span).fontFamily;
    span.remove();
    return f;
  };
  return {
    primary: cssColor(s, "--brand-rgb", "rgb(16 122 87)"),
    primaryFg: cssColor(s, "--brand-fg-rgb", "rgb(255 255 255)"),
    accent: cssColor(s, "--accent2-on-dark-rgb", "rgb(242 140 40)"),
    brandText: cssColor(s, "--brand-on-dark-rgb", "rgb(52 211 153)"),
    display: probe("font-display"),
    sans: probe("font-sans"),
  };
}

/** Texto en mayúsculas con espaciado, si el navegador lo soporta. */
function spaced(ctx: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** Achica la fuente hasta que el texto entre en `max` px. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, max: number) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    s -= 4;
  } while (ctx.measureText(text).width > max && s > 24);
}

/**
 * La historia, estilo transmisión: fondo oscuro, franja diagonal con el color del
 * club, el número grande y hasta tres más abajo. 1080×1920 (9:16, Instagram).
 */
function drawStory(ctx: CanvasRenderingContext2D, c: StoryContent, look: Look) {
  const M = 96;
  ctx.fillStyle = "#0B0F14";
  ctx.fillRect(0, 0, W, H);

  // Franjas diagonales: principal y segundo color del club.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(W * 0.58, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H * 0.42);
  ctx.lineTo(W * 0.18, H * 0.42 + 250);
  ctx.closePath();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = look.primary;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = look.accent;
  ctx.beginPath();
  ctx.moveTo(W, H * 0.42 - 18);
  ctx.lineTo(W, H * 0.42 + 6);
  ctx.lineTo(W * 0.18, H * 0.42 + 256);
  ctx.lineTo(W * 0.18, H * 0.42 + 232);
  ctx.closePath();
  ctx.fill();

  // Escudo (iniciales) + club.
  const initials =
    c.club
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "C";
  ctx.beginPath();
  ctx.arc(M + 48, 168, 48, 0, Math.PI * 2);
  ctx.fillStyle = look.primary;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = look.accent;
  ctx.stroke();
  ctx.fillStyle = look.primaryFg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 40px ${look.display}`;
  spaced(ctx, 0);
  ctx.fillText(initials, M + 48, 170);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#F3F4F6";
  spaced(ctx, 4);
  fit(ctx, c.club.toUpperCase(), 700, 44, look.display, W - M * 2 - 130);
  ctx.fillText(c.club.toUpperCase(), M + 128, 184);

  // Encabezado.
  ctx.fillStyle = look.accent;
  ctx.font = `600 48px ${look.display}`;
  spaced(ctx, 10);
  ctx.fillText("TU MES EN NÚMEROS", M, 400);
  ctx.fillStyle = "#F3F4F6";
  spaced(ctx, 2);
  fit(ctx, c.month, 800, 150, look.display, W - M * 2);
  ctx.fillText(c.month, M, 550);
  if (c.firstName) {
    ctx.fillStyle = "#9CA3AF";
    ctx.font = `500 56px ${look.sans}`;
    spaced(ctx, 0);
    ctx.fillText(c.firstName, M, 640);
  }

  // Número grande.
  ctx.fillStyle = look.brandText;
  ctx.font = `800 460px ${look.display}`;
  spaced(ctx, -8);
  ctx.fillText(c.hero.value, M - 12, 1080);
  if (c.hero.unit) {
    const w = ctx.measureText(c.hero.value).width;
    ctx.font = `700 170px ${look.display}`;
    spaced(ctx, 0);
    ctx.fillText(c.hero.unit, M + w + 4, 1080);
  }
  ctx.fillStyle = "#F3F4F6";
  ctx.font = `600 60px ${look.display}`;
  spaced(ctx, 3);
  ctx.fillText(c.hero.label.toUpperCase(), M, 1170);

  // Hasta tres números más, en filas con línea divisoria.
  let y = 1320;
  for (const s of c.stats) {
    ctx.fillStyle = "#26303E";
    ctx.fillRect(M, y - 4, W - M * 2, 3);
    ctx.fillStyle = "#F3F4F6";
    ctx.font = `800 120px ${look.display}`;
    spaced(ctx, 0);
    ctx.fillText(s.value, M, y + 124);
    let x = M + ctx.measureText(s.value).width + 6;
    if (s.unit) {
      ctx.fillStyle = "#9CA3AF";
      ctx.font = `700 60px ${look.display}`;
      ctx.fillText(s.unit, x, y + 124);
      x += ctx.measureText(s.unit).width;
    }
    ctx.fillStyle = "#D1D5DB";
    spaced(ctx, 2);
    fit(ctx, s.label.toUpperCase(), 600, 44, look.display, W - M - x - 36);
    ctx.fillText(s.label.toUpperCase(), x + 36, y + 112);
    y += 170;
  }

  // Pie.
  ctx.fillStyle = "#6B7280";
  ctx.font = `600 34px ${look.display}`;
  spaced(ctx, 6);
  ctx.fillText("NUTREITOR · NUTRICIÓN DEPORTIVA", M, H - 96);
}

/**
 * "Tu mes en números" (KAN-76): botón que abre la historia del reporte publicado para
 * descargarla o compartirla (en el celular, la hoja de compartir del sistema lleva
 * directo a Instagram). Sólo hábitos, nunca medidas corporales (ADR 0040).
 */
export function ReportStory({ report, athleteName, club }: { report: PatientReportDto; athleteName: string; club: string }) {
  const content = useMemo(() => storyContent(report, { fullName: athleteName, club }), [report, athleteName, club]);
  const [open, setOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [canShare, setCanShare] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !content || !canvas.current || !anchor.current) return;
    let cancelled = false;
    const look = readLook(anchor.current);
    const cv = canvas.current;
    // Las fuentes de next/font cargan a demanda: esperarlas antes de dibujar.
    void Promise.all([
      document.fonts.load(`800 100px ${look.display}`),
      document.fonts.load(`600 100px ${look.display}`),
      document.fonts.load(`500 100px ${look.sans}`),
    ])
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        drawStory(ctx, content, look);
        cv.toBlob((b) => {
          if (cancelled || !b) return;
          setBlob(b);
          const file = new File([b], content.fileName, { type: "image/png" });
          setCanShare(typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }));
        }, "image/png");
      });
    return () => {
      cancelled = true;
    };
  }, [open, content]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!content) return null;

  function download() {
    if (!blob || !content) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = content.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function share() {
    if (!blob || !content) return;
    try {
      await navigator.share({ files: [new File([blob], content.fileName, { type: "image/png" })], title: "Mi mes en números" });
    } catch {
      // Cancelado por el usuario: nada que hacer.
    }
  }

  const root = typeof document !== "undefined" ? (document.querySelector<HTMLElement>("[data-theme]") ?? document.body) : null;

  return (
    <>
      <span ref={anchor} className="contents">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Sparkles className="h-4 w-4" aria-hidden /> Tu mes en números
        </Button>
      </span>
      {open &&
        root &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print:hidden">
            <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default" />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Tu mes en números"
              className="relative flex max-h-full w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-2xl border border-stone-200 bg-surface p-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-semibold uppercase tracking-wider text-stone-500">Historia para compartir</p>
                <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-full p-1 text-stone-500 hover:text-stone-900">
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <canvas
                ref={canvas}
                width={W}
                height={H}
                role="img"
                aria-label={`${content.month}: ${content.hero.value}${content.hero.unit ?? ""} ${content.hero.label}${content.stats
                  .map((s) => `, ${s.value}${s.unit ?? ""} ${s.label}`)
                  .join("")}`}
                className="mx-auto aspect-[9/16] max-h-[60vh] w-auto max-w-full rounded-xl bg-[#0B0F14]"
              />
              <p className="text-xs text-stone-500">
                Sólo tus hábitos del mes. No incluye peso, pliegues, medidas ni el comentario de tu profesional.
              </p>
              <div className="flex gap-2">
                {canShare && (
                  <Button onClick={share} disabled={!blob} className="flex-1">
                    <Share2 className="h-4 w-4" aria-hidden /> Compartir
                  </Button>
                )}
                <Button variant={canShare ? "secondary" : "primary"} onClick={download} disabled={!blob} className="flex-1">
                  <Download className="h-4 w-4" aria-hidden /> Descargar
                </Button>
              </div>
            </div>
          </div>,
          root,
        )}
    </>
  );
}
