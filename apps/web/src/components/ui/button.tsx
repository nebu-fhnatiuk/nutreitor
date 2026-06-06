import type { ButtonHTMLAttributes } from "react";

import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition " +
  "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";

const VARIANTS: Record<ButtonVariant, string> = {
  // Relleno de marca (var-driven → respeta el white-label por tenant).
  primary: "bg-brand text-brand-fg hover:brightness-110",
  // Contorno neutro que vira a marca en hover.
  secondary: "border border-stone-200 text-stone-700 hover:border-brand/40 hover:text-brand",
  // Sin relleno (acciones terciarias: cancelar, cerrar).
  ghost: "text-stone-500 hover:bg-stone-100 hover:text-stone-800",
  // Acción destructiva.
  danger: "text-red-600 hover:bg-red-50",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-4 py-1.5 text-sm",
  md: "px-5 py-2 text-sm",
};

/** Clases del botón, para reutilizar el estilo en `<Link>`/`<a>` sin duplicar. */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

/**
 * Botón unificado. Antes el mismo `bg-brand … text-brand-fg` (y sus variantes) vivía
 * inline en ~20 lugares con paddings/opacidades distintas. Mismas variantes, un token.
 */
export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}
