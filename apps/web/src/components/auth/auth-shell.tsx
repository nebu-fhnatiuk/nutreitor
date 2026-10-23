"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { clubInitials } from "@nutreitor/shared";

import { cn, ThemeToggle, ZoneMark, type Zone } from "@/components/ui";

/** Quién recibe: el club (subdominio) o Nutreitor (dominio raíz). */
export interface AuthBrand {
  name: string;
  logoUrl?: string | null;
}

const NUTREITOR: AuthBrand = { name: "Nutreitor" };

/** Franjas diagonales con los dos colores del club (decorativas). */
function Stripes({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0", className)}>
      <div className="absolute inset-0 bg-brand opacity-20 [clip-path:polygon(62%_0,100%_0,100%_58%,18%_100%)]" />
      <div className="absolute inset-0 bg-accent2 [clip-path:polygon(100%_56%,100%_60%,18%_100%,18%_98.5%)]" />
    </div>
  );
}

/** Escudo: el logo del club si tiene, si no sus iniciales con los dos colores. */
export function Crest({ brand, size = "md" }: { brand: AuthBrand; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-[72px] w-[72px] text-[28px] ring-[5px]" : "h-12 w-12 text-lg ring-[3px]";
  if (brand.logoUrl) {
    return (
      // El logo es una URL que carga el club: <img> simple, sin optimizar.
      <img src={brand.logoUrl} alt="" className={cn("shrink-0 rounded-full bg-surface object-contain ring-accent2", box)} />
    );
  }
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full bg-brand font-display font-bold text-brand-fg ring-accent2", box)}>
      {clubInitials(brand.name)}
    </span>
  );
}

/**
 * Marco de las pantallas de acceso (KAN-77): tema Estadio con los colores del club
 * desde la primera pantalla. En el celular, escudo arriba y formulario; en escritorio,
 * a la izquierda el panel del club con las franjas y a la derecha el formulario.
 * El modo claro/oscuro es la misma preferencia del workspace (ADR 0037).
 */
export function AuthShell({ brand, children }: { brand?: AuthBrand | null; children: ReactNode }) {
  const b = brand ?? NUTREITOR;
  const isClub = b !== NUTREITOR;
  return (
    <div data-theme="estadio" className="relative min-h-screen bg-stone-50 text-stone-900 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r border-stone-200 p-14 lg:flex lg:flex-col lg:justify-between">
        <Stripes className="h-full" />
        <div className="relative flex items-center gap-4">
          <Crest brand={b} size="lg" />
          <span className="font-display text-2xl font-bold uppercase tracking-[0.08em]">{b.name}</span>
        </div>
        <div className="relative max-w-lg">
          <p className="font-display text-lg font-semibold uppercase tracking-[0.2em] text-accent2">Nutrición deportiva</p>
          <p className="mt-2 font-display text-7xl font-extrabold uppercase leading-[0.95]">
            Tu plan, tus mediciones, tu plantel.
          </p>
          <p className="mt-5 text-lg text-stone-600">
            {isClub ? "El espacio del club para el cuerpo técnico y los deportistas." : "Para nutricionistas, clubes y gimnasios."}
          </p>
        </div>
        <p className="relative font-display text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">
          {isClub ? "Con Nutreitor" : "nutreitor.com"}
        </p>
      </aside>

      <div className="relative flex min-h-screen flex-col overflow-hidden px-6 pb-6 pt-10 sm:px-10 lg:overflow-visible">
        <Stripes className="h-[170px] lg:hidden" />
        <header className="relative flex items-center gap-3 lg:hidden">
          <Crest brand={b} />
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-bold uppercase tracking-[0.06em]">{b.name}</p>
            <p className="text-sm text-stone-500">Nutrición deportiva</p>
          </div>
        </header>
        <main className="relative mx-auto mt-20 w-full max-w-sm flex-1 lg:mt-0 lg:flex lg:flex-col lg:justify-center">{children}</main>
        <footer className="relative mx-auto mt-10 flex w-full max-w-sm items-center justify-between lg:max-w-none">
          <span className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 lg:invisible">
            {isClub ? "Con Nutreitor" : "nutreitor.com"}
          </span>
          <ThemeToggle
            menuItem={false}
            className="flex min-h-11 items-center gap-2 rounded-full border border-stone-200 px-4 text-sm text-stone-600 transition hover:border-stone-300 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </footer>
      </div>
    </div>
  );
}

/** Rótulo de color + título condensado grande. */
export function AuthHeading({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <div>
      {kicker && <p className="font-display text-base font-semibold uppercase tracking-[0.2em] text-accent2">{kicker}</p>}
      <h1 className="mt-1 font-display text-[52px] font-extrabold uppercase leading-[0.95] text-stone-900">{title}</h1>
      {children && <div className="mt-3 text-base leading-relaxed text-stone-600">{children}</div>}
    </div>
  );
}

const inputClass =
  "h-[52px] w-full rounded-xl border border-stone-200 bg-surface px-4 text-base text-stone-900 outline-none transition " +
  "placeholder:text-stone-400 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand " +
  "aria-[invalid=true]:border-zone-bad";

/** Campo grande (52 px): etiqueta arriba, ayuda abajo. */
export function AuthField({
  label,
  hint,
  className,
  ...input
}: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm text-stone-500">{label}</label>
      <input id={id} aria-describedby={hint ? hintId : undefined} className={inputClass} {...input} />
      {hint && <p id={hintId} className="mt-1.5 text-sm text-stone-500">{hint}</p>}
    </div>
  );
}

/** Contraseña con el botón para mostrarla (se escribe mucho desde el celular). */
export function PasswordField({
  label,
  hint,
  ...input
}: { label: string; hint?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [show, setShow] = useState(false);
  const Icon = show ? EyeOff : Eye;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-stone-500">{label}</label>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} aria-describedby={hint ? hintId : undefined} className={cn(inputClass, "pr-14")} {...input} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={show}
          className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-lg text-stone-500 transition hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Icon className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {hint && <div id={hintId} className="mt-1.5 text-sm text-stone-500">{hint}</div>}
    </div>
  );
}

/** Botón principal: alto, condensado, con el color del club. */
export function AuthButton({ className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn(authButtonClass, className)} {...rest} />;
}

export const authButtonClass =
  "flex h-[54px] w-full items-center justify-center rounded-xl bg-brand px-5 font-display text-xl font-bold uppercase tracking-[0.08em] text-brand-fg transition " +
  "hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** Aviso con forma + color de zona (nunca sólo color): error, espera o listo. */
export function AuthNotice({ zone, title, children, live = "alert" }: { zone: Zone; title: string; children?: ReactNode; live?: "alert" | "status" }) {
  const border = { ok: "border-zone-ok/60", warn: "border-zone-warn/70", bad: "border-zone-bad/70" }[zone];
  return (
    <div role={live} className={cn("flex items-start gap-3 rounded-xl border bg-surface px-4 py-3.5 text-[15px] leading-snug", border)}>
      <ZoneMark zone={zone} className="mt-1.5" />
      <div>
        <p className="font-semibold text-stone-900">{title}</p>
        {children && <div className="mt-0.5 text-stone-600">{children}</div>}
      </div>
    </div>
  );
}

/** Link secundario (volver, olvidé la contraseña): 44 px de alto para el dedo. */
export function AuthLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} className={cn("inline-flex min-h-11 items-center gap-1.5 text-[15px] text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded", className)}>
      {children}
    </a>
  );
}
