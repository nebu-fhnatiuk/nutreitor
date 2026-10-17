import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "./cn";

/**
 * Estilo único de campo de formulario (sin ancho). Antes este string se
 * reimplementaba en ~18 pantallas.
 */
export const fieldClass =
  "rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none " +
  "placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Ancho por defecto `w-full`, salvo que el caller pase su propio ancho (`w-64`,
 * `w-16`, `w-auto`, `flex-1`…). Evita el conflicto donde `w-full` ganaba por orden de
 * CSS sobre el override (sin necesidad de tailwind-merge).
 */
function fieldWith(className?: string): string {
  const hasWidth = className ? /(^|\s)(w-|flex-1)/.test(className) : false;
  return cn(fieldClass, !hasWidth && "w-full", className);
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={fieldWith(className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={fieldWith(className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={fieldWith(className)} {...rest}>
      {children}
    </select>
  );
}

/** Etiqueta + control. Unifica el patrón `<label><span/>…</label>` repetido en forms. */
export function Label({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", wide && "sm:col-span-2")}>
      <span className="mb-1 block text-xs text-stone-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}
