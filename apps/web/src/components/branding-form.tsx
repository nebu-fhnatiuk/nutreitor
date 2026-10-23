"use client";

import { Check, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import {
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  SURFACE_DARK,
  SURFACE_LIGHT,
  clubPalette,
  parseHex,
  toTriplet,
  type BrandingDto,
  type ClubPalette,
  type Rgb,
} from "@nutreitor/shared";

import { Alert, Button, Input, cn } from "@/components/ui";
import { errorMessage } from "@/lib/api";

const rgb = (c: Rgb) => `rgb(${toTriplet(c)})`;
const rgba = (c: Rgb, a: number) => `rgb(${toTriplet(c)} / ${a})`;

/**
 * Marca del club (KAN-69): nombre visible, logo y los dos colores de la camiseta.
 * La paleta completa (texto sobre cada color, tonos ajustados para usarlos como
 * texto) sale de `clubPalette`, igual que en el layout del tenant; la vista previa
 * la muestra en oscuro y en claro, con el control de contraste AA.
 */
export function BrandingForm({ initial }: { initial: BrandingDto | null }) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [primary, setPrimary] = useState((initial?.brandPrimaryColor ?? DEFAULT_PRIMARY).toUpperCase());
  const [secondary, setSecondary] = useState((initial?.brandSecondaryColor ?? DEFAULT_SECONDARY).toUpperCase());
  const [logoUrl, setLogoUrl] = useState(initial?.brandLogoUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const valid = parseHex(primary) !== null && parseHex(secondary) !== null;
  const palette = useMemo(() => clubPalette(primary, secondary), [primary, secondary]);
  const initials = (displayName || initial?.name || "Club")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "C";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/editor/branding", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          brandPrimaryColor: primary,
          brandSecondaryColor: secondary,
          brandLogoUrl: logoUrl.trim() || null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message ?? `HTTP ${r.status}`);
      setMsg("Colores guardados. Aplicando…");
      setTimeout(() => window.location.reload(), 700);
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="branding-nombre" className="mb-1 block text-sm text-stone-500">Nombre visible</label>
          <Input
            id="branding-nombre"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nombre que ven los deportistas"
          />
        </div>
        <ColorField id="branding-color-1" label="Color principal" hint="El de la camiseta titular: botones, pestañas activas." value={primary} onChange={setPrimary} />
        <ColorField id="branding-color-2" label="Segundo color" hint="El de los detalles: partido, deportistas en la somatocarta." value={secondary} onChange={setSecondary} />
        <div className="sm:col-span-2">
          <label htmlFor="branding-logo" className="mb-1 block text-sm text-stone-500">URL del escudo o logo (opcional)</label>
          <Input id="branding-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/escudo.png" />
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-display text-sm font-semibold uppercase tracking-wider text-stone-500">Vista previa</p>
          <button
            type="button"
            onClick={() => {
              setPrimary(DEFAULT_PRIMARY);
              setSecondary(DEFAULT_SECONDARY);
            }}
            className="text-sm text-stone-500 transition hover:text-brand"
          >
            Volver a los colores de Nutreitor
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Preview palette={palette} mode="dark" initials={initials} name={displayName || initial?.name || "Tu club"} />
          <Preview palette={palette} mode="light" initials={initials} name={displayName || initial?.name || "Tu club"} />
        </div>
        {palette.tooSimilar && (
          <p className="mt-3 flex items-center gap-2 text-sm text-amber-700">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
            Los dos colores casi no se distinguen: el día de partido y el resto se van a ver iguales.
          </p>
        )}
        <Checks palette={palette} />
      </div>

      {err && <Alert>{err}</Alert>}
      {msg && <p className="text-sm text-brand">{msg}</p>}

      <Button type="submit" disabled={busy || !valid}>
        {busy ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}

function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const ok = parseHex(text) !== null;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-stone-500">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}: elegir`}
          value={parseHex(value) ? (value.startsWith("#") ? value : `#${value}`) : "#000000"}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            setText(v);
            onChange(v);
          }}
          className="h-10 w-14 cursor-pointer rounded-lg border border-stone-200 bg-surface"
        />
        <Input
          id={id}
          value={text}
          onChange={(e) => {
            const v = e.target.value.trim().toUpperCase();
            setText(v);
            if (parseHex(v)) onChange(v.startsWith("#") ? v : `#${v}`);
          }}
          aria-invalid={!ok}
          className={cn("w-32 font-mono", !ok && "border-red-300")}
          maxLength={7}
        />
      </div>
      <p className="mt-1 text-xs text-stone-500">{ok ? hint : "Usá el formato #RRGGBB."}</p>
    </div>
  );
}

/**
 * Miniatura del workspace con la paleta: estilos en línea (no las clases del tema)
 * para poder mostrar oscuro y claro a la vez, sin depender del modo actual.
 */
function Preview({ palette: p, mode, initials, name }: { palette: ClubPalette; mode: "dark" | "light"; initials: string; name: string }) {
  const dark = mode === "dark";
  const bg: Rgb = dark ? [11, 15, 20] : [250, 250, 249];
  const surface = dark ? SURFACE_DARK : SURFACE_LIGHT;
  const ink: Rgb = dark ? [243, 244, 246] : [28, 25, 23];
  const muted: Rgb = dark ? [156, 163, 175] : [120, 113, 108];
  const line: Rgb = dark ? [38, 48, 62] : [231, 229, 228];
  const brandText = dark ? p.primary.onDark : p.primary.onLight;
  const accentText = dark ? p.secondary.onDark : p.secondary.onLight;
  const bars = [0.8, 0.8, 0.55, 0.8, 0.8, 1, 0.55];
  return (
    <figure
      aria-label={`Vista previa en modo ${dark ? "oscuro" : "claro"}`}
      className="overflow-hidden rounded-2xl border border-stone-200 font-sans"
      style={{ background: rgb(bg), color: rgb(ink) }}
    >
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${rgb(line)}` }}>
        <span
          className="grid h-8 w-8 place-items-center rounded-full font-display text-xs font-bold"
          style={{ background: rgb(p.primary.base), color: rgb(p.primary.fg), boxShadow: `0 0 0 2px ${rgb(p.secondary.base)}` }}
        >
          {initials}
        </span>
        <span className="truncate font-display text-sm font-bold uppercase tracking-wider">{name}</span>
        <span className="ml-auto font-display text-[11px] font-semibold uppercase tracking-wider" style={{ color: rgb(muted) }}>
          {dark ? "Oscuro" : "Claro"}
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: rgb(p.primary.base), color: rgb(p.primary.fg) }}>
            Medir plantel
          </span>
          <span
            className="rounded-full px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wider"
            style={{ border: `1px solid ${rgba(p.secondary.base, 0.5)}`, color: rgb(accentText) }}
          >
            Primera división
          </span>
          <span className="text-sm font-medium" style={{ color: rgb(brandText) }}>Ver ficha →</span>
        </div>
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl p-3" style={{ background: rgb(surface), border: `1px solid ${rgb(line)}` }}>
            <div className="font-display text-[10px] font-semibold uppercase tracking-wider" style={{ color: rgb(muted) }}>Requerimiento</div>
            <div className="font-display text-3xl font-bold leading-none tabular-nums">3.416</div>
            <div className="mt-1 font-display text-[11px] font-semibold uppercase" style={{ color: rgb(accentText) }}>Hoy: partido</div>
          </div>
          <div className="flex flex-1 items-end gap-1 rounded-xl p-3" style={{ background: rgb(surface), border: `1px solid ${rgb(line)}` }} aria-hidden>
            {bars.map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-sm"
                style={{ height: `${h * 56}px`, background: i === 5 ? rgb(p.secondary.base) : h < 0.6 ? rgb(muted) : rgb(p.primary.base) }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-1.5">
          {["Evaluar", "Prescribir", "Seguir"].map((m, i) => (
            <span
              key={m}
              className="flex-1 rounded-lg px-2 py-1.5 font-display text-xs font-bold uppercase"
              style={
                i === 0
                  ? { background: rgba(p.primary.base, 0.15), border: `1px solid ${rgb(p.primary.base)}`, color: rgb(ink) }
                  : { border: `1px solid ${rgb(line)}`, color: rgb(muted) }
              }
            >
              <span className="block text-[10px]" style={{ color: i === 0 ? rgb(accentText) : rgb(muted) }}>0{i + 1}</span>
              {m}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

function Checks({ palette }: { palette: ClubPalette }) {
  return (
    <ul className="mt-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2" aria-label="Contraste (WCAG AA)">
      {palette.checks.map((c) => (
        <li key={c.label} className="flex items-center gap-2 text-stone-600">
          {c.ok ? (
            <Check className="h-4 w-4 shrink-0 text-zone-ok" aria-hidden />
          ) : (
            <TriangleAlert className="h-4 w-4 shrink-0 text-zone-warn" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            {c.label}
            {c.adjusted && <span className="text-stone-500"> · se usa un tono ajustado</span>}
          </span>
          <span className="font-display font-semibold tabular-nums text-stone-800">{c.ratio.toLocaleString("es-AR")}:1</span>
          <span className="sr-only">{c.ok ? "cumple AA" : "no cumple AA"}</span>
        </li>
      ))}
    </ul>
  );
}
